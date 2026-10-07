import { fetchTimetableSheetFromSheet, type TimetableSheetSnapshot } from '../../services/timetableSheetService';
import { READ_TIMEOUT_MS, errToMessage } from './helpers';

export async function fetchWithTimeout(
  force: boolean,
  onSuccess: (snapshot: TimetableSheetSnapshot | null) => void,
  onFailure: (message: string) => void,
  setRefreshing: (val: boolean) => void,
  setLoading: (val: boolean) => void
): Promise<boolean> {
  let guard: number | undefined;

  const request = (async (): Promise<boolean> => {
    setRefreshing(true);
    try {
      const next = await fetchTimetableSheetFromSheet({ forceRefresh: force });
      onSuccess(next ?? null);
      return true;
    } catch (err) {
      onFailure(errToMessage(err));
      return false;
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  })();

  const outward: Promise<boolean> = Promise.race([
    request.then((ok) => ({ ok, timedOut: false })),
    new Promise<{ ok: boolean; timedOut: boolean }>((resolve) => {
      guard = window.setTimeout(() => resolve({ ok: false, timedOut: true }), READ_TIMEOUT_MS);
    }),
  ]).then((outcome) => {
    if (guard !== undefined) window.clearTimeout(guard);
    if (outcome.timedOut) {
      onFailure(`The timetable sheet did not respond within ${READ_TIMEOUT_MS / 1000} seconds.`);
    }
    return outcome.ok;
  });

  return outward;
}
