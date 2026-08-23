
import { useState, useRef, useCallback } from 'react';
import { GoogleGenAI, Part } from '@google/genai';
import { LessonPlan, SLO, ContextPdf, ExportOption } from '../types';
import { generateLessonPlan } from '../services/geminiService';
import { exportAsDocx, exportAsPdf, exportMultipleLessonsAsDocx, exportMultipleLessonsAsPdf, formatFileName } from '../services/exportService';
import { get, set } from 'idb-keyval';

export const useLessonGeneration = (allSlos: SLO[], contextPdfs: ContextPdf[]) => {
    const [isLoading, setIsLoading] = useState(false);
    const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number } | null>(null);
    const [logMessages, setLogMessages] = useState<string[]>([]);
    const [isComplete, setIsComplete] = useState<boolean>(false);
    const [generatedPlans, setGeneratedPlans] = useState<LessonPlan[]>([]);
    
    const isCancelledRef = useRef(false);
    const fetchPromisesRef = useRef(new Map<string, Promise<string>>());

    const fileToPart = useCallback(async (file: File): Promise<Part> => {
        const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = (error) => reject(error);
        });
        return {
            inlineData: {
                mimeType: file.type,
                data: base64,
            },
        };
    }, []);

    const urlToPart = useCallback(async (url: string): Promise<Part> => {
        // 1. Check IndexedDB for cached Base64 data
        try {
            const cachedBase64 = await get<string>(url);
            if (cachedBase64) {
                return { inlineData: { mimeType: 'application/pdf', data: cachedBase64 } };
            }
        } catch (e) {
            console.warn('Failed to read from cache', e);
        }

        // 2. Deduplication for in-flight requests
        if (fetchPromisesRef.current.has(url)) {
            const base64 = await fetchPromisesRef.current.get(url)!;
             return { inlineData: { mimeType: 'application/pdf', data: base64 } };
        }

        const downloadWithRetry = async (attemptsLeft: number): Promise<string> => {
            const controller = new AbortController();
            // Increased timeout to 180s (3 mins) for large files/slow proxy
            const timeoutId = setTimeout(() => controller.abort(), 180000);

            try {
                const response = await fetch(url, { signal: controller.signal });
                if (!response.ok) {
                     throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
                }
                const blob = await response.blob();
                
                if (blob.size < 1000) {
                     throw new Error(`Downloaded file is too small (${blob.size} bytes), likely invalid.`);
                }
                if (blob.type && blob.type.includes('text/html')) {
                     throw new Error(`Downloaded file appears to be HTML, not PDF. Proxy may have failed.`);
                }

                const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(blob);
                    reader.onload = () => resolve((reader.result as string).split(',')[1]);
                    reader.onerror = (error) => reject(error);
                });

                // Cache result in IndexedDB
                await set(url, base64); 
                return base64;

            } catch (error: any) {
                if (attemptsLeft > 0) {
                    console.warn(`Download failed for ${url.split('/').pop()}. Retrying... (${attemptsLeft} attempts left). Error: ${error.message}`);
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
                    return downloadWithRetry(attemptsLeft - 1);
                }
                if (error.name === 'AbortError') throw new Error("Download timed out after 180s");
                throw error;
            } finally {
                clearTimeout(timeoutId);
            }
        };

        const promise = downloadWithRetry(2); // 2 retries = 3 total attempts
        fetchPromisesRef.current.set(url, promise);

        try {
            const base64 = await promise;
            return { inlineData: { mimeType: 'application/pdf', data: base64 } };
        } catch (error) {
             throw new Error(`Failed to process PDF ${url.split('/').pop()}: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
             fetchPromisesRef.current.delete(url);
        }
    }, []);

    const getContextPartsForSlo = useCallback(async (grade: string, unitNumber: string) => {
        const contextPdfsForSlo = contextPdfs.filter(p => p.grade === grade && parseInt(p.unit, 10) === parseInt(unitNumber, 10));
        const contextFileParts: Part[] = [];
        if (contextPdfsForSlo.length > 0) {
            for (const pdf of contextPdfsForSlo) {
                try {
                    let part: Part | undefined;
                    if (pdf.file) {
                        part = await fileToPart(pdf.file);
                    } else if (pdf.url) {
                        setLogMessages(prev => [...prev, `Downloading context: ${pdf.name}...`]);
                        part = await urlToPart(pdf.url);
                    }
                    if (part) contextFileParts.push(part);
                } catch (e) {
                    console.error(`Error processing ${pdf.name}`, e);
                    setLogMessages(prev => [...prev, `WARN: ${e instanceof Error ? e.message : 'Unknown error processing PDF'}`]);
                    // Continue without this file instead of halting generation
                }
            }
        }
        return contextFileParts;
    }, [contextPdfs, fileToPart, urlToPart]);

    const generateAllLessonPlans = useCallback(async (selectedSloUniqueIds: string[], exportOption: ExportOption) => {
        isCancelledRef.current = false;
        setIsLoading(true);
        setIsComplete(false);
        setGeneratedPlans([]);
        setLogMessages(['Starting lesson plan generation...']);
        const selectedSlos = allSlos.filter(slo => selectedSloUniqueIds.includes(slo.uniqueId!));
        let wasCancelled = false;
        const allGeneratedPlans: LessonPlan[] = [];
        
        const processSlo = async (slo: SLO): Promise<LessonPlan | null> => {
            const MAX_RETRIES = 1; 
            const unitContextSlos = selectedSlos.filter(s => s.grade === slo.grade && s.Unit_Name === slo.Unit_Name);
            
            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                try {
                    if (isCancelledRef.current) return null; 
                    if (attempt > 0) {
                        setLogMessages(prev => [...prev, `Retrying generation for ${slo.SLO_ID}...`]);
                    }
                    
                    if (attempt === 0) setLogMessages(prev => [...prev, `Preparing context for ${slo.SLO_ID}...`]);
                    const contextFileParts = await getContextPartsForSlo(slo.grade!, slo.Unit_Number);
    
                    if (contextFileParts.length === 0 && attempt === 0) {
                         setLogMessages(prev => [...prev, `WARN: No valid context PDF found for SLO ${slo.SLO_ID}. Generation will rely on internal knowledge.`]);
                    }
                    
                    if (attempt === 0) setLogMessages(prev => [...prev, `Generating lesson plan content...`]);
                     const plan = await generateLessonPlan(slo, unitContextSlos, contextFileParts, undefined, (msg) => setLogMessages(prev => [...prev, msg]));
                    
                    plan.unitNumber = slo.Unit_Number;
                    
                    setLogMessages(prev => [...prev, `Content received for "${plan.title}"`]);
                    return plan;
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    if (errorMsg.startsWith('PDF_CONTEXT_NOT_SUPPORTED:')) {
                        setLogMessages(prev => [...prev, `\nINFO: ${errorMsg}`]);
                         const plan = await generateLessonPlan(slo, unitContextSlos, [], undefined, (msg) => setLogMessages(prev => [...prev, msg]));
                        if (plan) {
                            plan.unitNumber = slo.Unit_Number;
                            setLogMessages(prev => [...prev, `Content received for "${plan.title}" (without PDF context)`]);
                            return plan;
                        }
                        return null;
                    }
                    const fullErrorMsg = `Failed for ${slo.SLO_ID} (Attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${errorMsg}`;
                    console.error(fullErrorMsg);
                    setLogMessages(prev => [...prev, `ERROR: ${fullErrorMsg}`]);
                    if (attempt < MAX_RETRIES) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            }
            setLogMessages(prev => [...prev, `ERROR: Skipped ${slo.SLO_ID} after all attempts failed.`]);
            return null;
        };
    
        if (exportOption === 'individual') {
            setGenerationProgress({ current: 0, total: selectedSlos.length });
            for (let i = 0; i < selectedSlos.length; i++) {
                if (isCancelledRef.current) { wasCancelled = true; break; }
                const slo = selectedSlos[i];
                setGenerationProgress({ current: i + 1, total: selectedSlos.length });
                setLogMessages(prev => [...prev, `\nProcessing SLO: ${slo.SLO_ID}`]);
                
                const plan = await processSlo(slo);
                if (plan) {
                    allGeneratedPlans.push(plan);
                    setLogMessages(prev => [...prev, `Exporting individual files...`]);
                    await exportAsDocx(plan, slo.SLO_ID);
                    await new Promise(resolve => setTimeout(resolve, 250));
                    try {
                      await exportAsPdf(plan, slo.SLO_ID);
                    } catch (e) {
                      setLogMessages(prev => [...prev, `WARN: Failed to export PDF for ${slo.SLO_ID}: ${e instanceof Error ? e.message : 'Unknown error'}`]);
                    }
                    await new Promise(resolve => setTimeout(resolve, 250));
                }
            }
        } else {
            let groups: Map<string, SLO[]>;
            switch (exportOption) {
                case 'byUnit':
                    groups = selectedSlos.reduce((acc, current) => {
                        const key = `${current.grade}_${current.Unit_Name}`;
                        if (!acc.has(key)) acc.set(key, []);
                        acc.get(key)!.push(current);
                        return acc;
                    }, new Map());
                    break;
                case 'byGrade':
                    groups = selectedSlos.reduce((acc, current) => {
                        const key = current.grade!;
                        if (!acc.has(key)) acc.set(key, []);
                        acc.get(key)!.push(current);
                        return acc;
                    }, new Map());
                    break;
                case 'all':
                default:
                    groups = new Map([['all_selected_plans', selectedSlos]]);
                    break;
            }
    
            setGenerationProgress({ current: 0, total: selectedSlos.length });
            let processedCount = 0;
    
            for (const [key, slosInGroup] of groups.entries()) {
                if (wasCancelled) break;
                if (slosInGroup.length === 0) continue;
                
                const groupName = key.replace(/_/g, ' ');
                setLogMessages(prev => [...prev, `\n--- Starting group: ${groupName} ---`]);
    
                const generatedPlansForGroup: LessonPlan[] = [];
                for (const slo of slosInGroup) {
                    if (isCancelledRef.current) { wasCancelled = true; break; }
                    processedCount++;
                    setGenerationProgress({ current: processedCount, total: selectedSlos.length });
                    setLogMessages(prev => [...prev, `Processing SLO: ${slo.SLO_ID}`]);
                    const plan = await processSlo(slo);
                    if (plan) {
                        generatedPlansForGroup.push(plan);
                    }
                }
                allGeneratedPlans.push(...generatedPlansForGroup);
                
                if (generatedPlansForGroup.length > 0 && !wasCancelled) {
                    const fileName = formatFileName(groupName);
                    setLogMessages(prev => [...prev, `Combining and exporting ${fileName}.pdf...`]);
                    try {
                      await exportMultipleLessonsAsPdf(generatedPlansForGroup, fileName);
                    } catch (e) {
                      setLogMessages(prev => [...prev, `WARN: Failed to export combined PDF for ${fileName}: ${e instanceof Error ? e.message : 'Unknown error'}`]);
                    }
                    await new Promise(resolve => setTimeout(resolve, 250));
                    
                    setLogMessages(prev => [...prev, `Combining and exporting ${fileName}.docx...`]);
                    await exportMultipleLessonsAsDocx(generatedPlansForGroup, fileName);
                    await new Promise(resolve => setTimeout(resolve, 250));
                }
            }
        }
        
        setGeneratedPlans(allGeneratedPlans);
    
        if (wasCancelled) {
            setLogMessages(prev => [...prev, `\nGeneration cancelled by user.`]);
        } else {
            setLogMessages(prev => [...prev, `\nGeneration finished.`]);
            setIsComplete(true);
        }
    
        setIsLoading(false);
        setGenerationProgress(null);
    }, [allSlos, getContextPartsForSlo]);

    const stopGeneration = useCallback(() => {
        isCancelledRef.current = true;
    }, []);

    const clearLogs = useCallback(() => {
        setLogMessages([]);
        setIsComplete(false);
        setGeneratedPlans([]);
    }, []);

    return {
        generateAllLessonPlans,
        stopGeneration,
        isLoading,
        generationProgress,
        logMessages,
        isComplete,
        generatedPlans,
        clearLogs
    };
};
