import type { RecognitionResult } from '@sen-checkin/types';

import { createAttendanceRecord } from './client-functions';
import type { AttendanceType } from './query-keys';
import { API_BASE_URL } from './api';

export async function verifyFace(imageBase64: string): Promise<RecognitionResult> {
  const response = await fetch(`${API_BASE_URL}/recognition/identify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ image: imageBase64 }),
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Face verification failed');
  }

  return (await response.json()) as RecognitionResult;
}

export async function recordAttendance(
  employeeId: string,
  deviceId: string,
  type: AttendanceType,
  metadata?: Record<string, unknown>,
) {
  return createAttendanceRecord({
    employeeId,
    deviceId,
    type,
    metadata,
  });
}
