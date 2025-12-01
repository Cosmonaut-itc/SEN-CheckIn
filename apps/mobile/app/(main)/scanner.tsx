import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button, Select, Spinner, Card } from 'heroui-native';

import { verifyFace, recordAttendance } from '@/lib/face-recognition';
import type { AttendanceType } from '@/lib/query-keys';
import { useDeviceContext } from '@/lib/device-context';

type ScanStatus =
  | { state: 'idle'; message: string }
  | { state: 'success'; message: string }
  | { state: 'error'; message: string };

export default function ScannerScreen(): JSX.Element {
  const router = useRouter();
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { settings } = useDeviceContext();

  const [attendanceType, setAttendanceType] = useState<AttendanceType>('CHECK_IN');
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanStatus, setScanStatus] = useState<ScanStatus>({
    state: 'idle',
    message: 'Align your face inside the frame',
  });

  const selectOptions = useMemo(
    () => [
      { value: 'CHECK_IN' as AttendanceType, label: 'Check-in' },
      { value: 'CHECK_OUT' as AttendanceType, label: 'Check-out' },
    ],
    [],
  );

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const handleOpenSettings = () => {
    router.push('/(main)/settings');
  };

  const handleCapture = async () => {
    if (!cameraRef.current || !settings?.deviceId) {
      setScanStatus({ state: 'error', message: 'Device is not linked. Open Settings.' });
      return;
    }

    setIsProcessing(true);
    setScanStatus({ state: 'idle', message: 'Verifying face...' });

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.45,
        base64: true,
        skipProcessing: true,
      });

      if (!photo.base64) {
        setScanStatus({ state: 'error', message: 'Failed to capture image' });
        return;
      }

      const match = await verifyFace(photo.base64);

      if (match.matched && match.employee) {
        await recordAttendance(match.employee.id, settings.deviceId, attendanceType, {
          similarity: match.match?.similarity,
          searchedFaceConfidence: match.searchedFaceConfidence,
        });

        const displayName = [match.employee.firstName, match.employee.lastName]
          .filter(Boolean)
          .join(' ');

        setScanStatus({
          state: 'success',
          message: `Hello, ${displayName || 'employee'}! ${attendanceType === 'CHECK_IN' ? 'Checked in' : 'Checked out'}.`,
        });
      } else {
        setScanStatus({ state: 'error', message: 'Face not recognized. Please try again.' });
      }
    } catch (error) {
      console.error('Face verification failed', error);
      setScanStatus({ state: 'error', message: 'Verification failed. Please retry.' });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!permission?.granted) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-2xl font-semibold mb-2">Camera access needed</Text>
        <Text className="text-base text-foreground-500 mb-4 text-center">
          We need camera permission to scan faces for attendance.
        </Text>
        <Button onPress={requestPermission}>
          <Button.Label>Allow camera</Button.Label>
        </Button>
      </View>
    );
  }

  const statusTint =
    scanStatus.state === 'success'
      ? 'bg-success-500/20 border-success-400'
      : scanStatus.state === 'error'
        ? 'bg-danger-500/20 border-danger-400'
        : 'bg-black/30 border-default-200';

  return (
    <View className="flex-1 bg-black">
      <CameraView
        ref={cameraRef}
        className="flex-1"
        facing="front"
        enableTorch={false}
        animateShutter
      />

      <View className="absolute left-0 right-0 top-0 flex-row justify-between items-center px-4 pt-12">
        <View className="flex-1 max-w-[180px]">
          <Select
            value={
              selectOptions.find((opt) => opt.value === attendanceType) ?? {
                value: attendanceType,
                label: attendanceType === 'CHECK_IN' ? 'Check-in' : 'Check-out',
              }
            }
            onValueChange={(opt) => setAttendanceType((opt?.value as AttendanceType) ?? 'CHECK_IN')}
          >
            <Select.Trigger className="bg-white/80 rounded-full px-3 py-2">
              <Select.Value placeholder="Attendance type" />
            </Select.Trigger>
            <Select.Content presentation="bottom-sheet">
              {selectOptions.map((opt) => (
                <Select.Item key={opt.value} value={opt.value} label={opt.label} />
              ))}
            </Select.Content>
          </Select>
        </View>

        <Button variant="ghost" onPress={handleOpenSettings}>
          <Button.Label>Settings</Button.Label>
        </Button>
      </View>

      <View className="absolute inset-0 items-center justify-center pointer-events-none">
        <View className="w-72 h-72 border-2 border-white/70 rounded-full" />
      </View>

      <View className="absolute inset-x-0 bottom-0 pb-8 px-4">
        <Card className={`p-4 border ${statusTint}`}>
          <Text className="text-sm text-foreground-500 mb-1 uppercase tracking-wide">
            {settings?.deviceId ? 'Ready' : 'Device not linked'}
          </Text>
          <Text className="text-lg font-semibold text-foreground mb-3">{scanStatus.message}</Text>

          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-foreground-500 text-sm">Device</Text>
              <Text className="text-foreground font-semibold">
                {settings?.deviceId ?? 'Not set'}
              </Text>
            </View>
            <Button
              onPress={handleCapture}
              isDisabled={isProcessing || !settings?.deviceId}
              className="min-w-[140px]"
            >
              {isProcessing ? (
                <View className="flex-row items-center gap-2">
                  <Spinner size="sm" />
                  <Button.Label>Verifying</Button.Label>
                </View>
              ) : (
                <Button.Label>Scan Now</Button.Label>
              )}
            </Button>
          </View>
        </Card>
      </View>

      {!settings?.deviceId ? (
        <TouchableOpacity
          onPress={handleOpenSettings}
          className="absolute right-4 bottom-28 bg-warning-500/80 px-4 py-2 rounded-full"
        >
          <Text className="text-black font-semibold">Link device</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
