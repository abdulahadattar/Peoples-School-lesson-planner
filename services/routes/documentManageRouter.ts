import { Router } from 'express';
import {
  getAllDossiers,
  getDossierByGr,
  getAllDocuments,
  updateDocumentMetadata,
  auditDossierAgainstSheet,
  auditAllDossiersAgainstSheet,
  autoLinkDocumentsAgainstSheet,
  assignDocumentToGr,
  dismissDiscrepancy,
  undismissDiscrepancy,
  getDismissedFlags,
  applyDiscrepancyCorrection,
  batchApplyDiscrepancyCorrections,
  getRankedCandidateMatches,
  deleteMultipleDocumentRecords,
  rescanDocumentRecord,
  rescanAllDocumentsRecord,
  selectTargetChildForDocument,
  reprocessDocumentWithAi,
  reprocessDossierDocumentsWithAi,
} from '../documentArchiveService.js';
import { sheetCache } from './sheetsRouter.js';

export function createDocumentManageRouter(getDocumentApiKeys: () => string[]): Router {
  const router = Router();

  router.get('/documents/dossiers', (_req, res) => {
    try {
      res.json({ ok: true, dossiers: getAllDossiers() });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/documents/all-docs', (_req, res) => {
    try {
      res.json({ ok: true, documents: getAllDocuments() });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/audit-all', (req, res) => {
    try {
      const { records = [] } = req.body || {};
      const discrepancies = auditAllDossiersAgainstSheet(records);
      res.json({ ok: true, discrepancies, dossiers: getAllDossiers() });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/documents/dossiers/:grNo', (req, res) => {
    const dossier = getDossierByGr(req.params.grNo);
    if (!dossier) {
      res.status(404).json({ error: 'Dossier not found for this GR' });
      return;
    }
    res.json({ ok: true, dossier });
  });

  router.post('/documents/audit/:grNo', (req, res) => {
    try {
      const { sheetRecord } = req.body || {};
      const discrepancies = auditDossierAgainstSheet(req.params.grNo, sheetRecord);
      res.json({ ok: true, discrepancies });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/auto-link', (req, res) => {
    try {
      const { records = [] } = req.body || {};
      const result = autoLinkDocumentsAgainstSheet(records);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/assign', (req, res) => {
    try {
      const { docId, targetGrNo, studentRecord } = req.body || {};
      if (!docId || !targetGrNo) {
        res.status(400).json({ error: 'docId and targetGrNo are required' });
        return;
      }
      const doc = assignDocumentToGr(docId, String(targetGrNo).trim(), studentRecord);
      if (!doc) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }
      res.json({ ok: true, document: doc, dossier: getDossierByGr(String(targetGrNo).trim()) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/discrepancies/dismiss', (req, res) => {
    try {
      const { flagId } = req.body || {};
      if (!flagId) {
        res.status(400).json({ error: 'flagId is required' });
        return;
      }
      res.json({ ok: true, success: dismissDiscrepancy(flagId) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/discrepancies/apply-correction', async (req, res) => {
    try {
      const { grNo, flagId, correction, accessToken } = req.body || {};
      if (!grNo || !correction) {
        res.status(400).json({ error: 'grNo and correction are required' });
        return;
      }
      const authHeader = req.headers.authorization;
      const token = accessToken || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined);
      const result = await applyDiscrepancyCorrection(grNo, flagId, correction, token);
      Object.keys(sheetCache).forEach(k => delete sheetCache[k]);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/discrepancies/batch-apply', async (req, res) => {
    try {
      const { corrections = [], accessToken } = req.body || {};
      const authHeader = req.headers.authorization;
      const token = accessToken || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined);
      const result = await batchApplyDiscrepancyCorrections(corrections, token);
      Object.keys(sheetCache).forEach(k => delete sheetCache[k]);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/candidate-matches', (req, res) => {
    try {
      const { extractedInfo, topN = 5 } = req.body || {};
      const serverRecords = sheetCache['default']?.records || [];
      const matches = getRankedCandidateMatches(extractedInfo, serverRecords, topN);
      res.json({ ok: true, matches });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/discrepancies/undismiss', (req, res) => {
    try {
      const { flagId } = req.body || {};
      if (!flagId) {
        res.status(400).json({ error: 'flagId is required' });
        return;
      }
      res.json({ ok: true, success: undismissDiscrepancy(flagId) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/documents/dismissed-flags', (_req, res) => {
    try {
      res.json({ ok: true, flags: getDismissedFlags() });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/select-child', (req, res) => {
    try {
      const { docId, entryNoOrIndex } = req.body || {};
      if (!docId || entryNoOrIndex === undefined) {
        res.status(400).json({ error: 'docId and entryNoOrIndex are required' });
        return;
      }
      const updated = selectTargetChildForDocument(docId, Number(entryNoOrIndex));
      if (!updated) {
        res.status(404).json({ error: 'Document or child entry not found' });
        return;
      }
      res.json({ ok: true, document: updated });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/reprocess-doc', async (req, res) => {
    try {
      const { docId } = req.body || {};
      if (!docId) {
        res.status(400).json({ error: 'docId is required' });
        return;
      }
      const keys = getDocumentApiKeys();
      const updated = await reprocessDocumentWithAi(docId, keys);
      if (!updated) {
        res.status(404).json({ error: 'Document not found or image missing' });
        return;
      }
      res.json({ ok: true, document: updated });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/reprocess-dossier', async (req, res) => {
    try {
      const { grNo } = req.body || {};
      if (!grNo) {
        res.status(400).json({ error: 'grNo is required' });
        return;
      }
      const keys = getDocumentApiKeys();
      const dossier = await reprocessDossierDocumentsWithAi(String(grNo).trim(), keys);
      if (!dossier) {
        res.status(404).json({ error: 'Dossier not found' });
        return;
      }
      res.json({ ok: true, dossier });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/update-doc', async (req, res) => {
    try {
      const { docId, newTag, rotateAngle } = req.body || {};
      if (!docId) {
        res.status(400).json({ error: 'docId is required' });
        return;
      }
      const updated = await updateDocumentMetadata(docId, newTag, rotateAngle);
      if (!updated) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }
      res.json({ ok: true, document: updated, dossier: getDossierByGr(updated.grNo) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/delete', (req, res) => {
    try {
      const { docId, docIds } = req.body || {};
      let idsToDelete: string[] = [];
      if (Array.isArray(docIds) && docIds.length > 0) {
        idsToDelete = docIds.filter(Boolean);
      } else if (docId) {
        idsToDelete = [docId];
      }

      if (idsToDelete.length === 0) {
        res.status(400).json({ error: 'docId or docIds is required' });
        return;
      }

      const { deletedCount } = deleteMultipleDocumentRecords(idsToDelete);
      res.json({ ok: true, deletedCount, dossiers: getAllDossiers(), documents: getAllDocuments() });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/rescan', async (req, res) => {
    try {
      const { docId } = req.body || {};
      if (!docId) {
        res.status(400).json({ error: 'docId is required' });
        return;
      }
      const serverKeys = getDocumentApiKeys();
      const updatedDoc = await rescanDocumentRecord(docId, serverKeys);
      res.json({ ok: true, document: updatedDoc, dossiers: getAllDossiers(), documents: getAllDocuments() });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/documents/rescan-all', async (_req, res) => {
    try {
      const serverKeys = getDocumentApiKeys();
      const result = await rescanAllDocumentsRecord(serverKeys);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
