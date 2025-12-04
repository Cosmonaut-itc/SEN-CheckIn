import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Button, Spinner, Card } from 'heroui-native';
import { Ionicons } from '@expo/vector-icons';

import { verifyFace, recordAttendance } from '@/lib/face-recognition';
import type { AttendanceType } from '@/lib/query-keys';
import { useDeviceContext } from '@/lib/device-context';

/** Represents the current status of the face scanning operation */
type ScanStatus =
  | { state: 'idle'; message: string }
  | { state: 'scanning'; message: string }
  | { state: 'success'; message: string; employeeName?: string }
  | { state: 'error'; message: string };

/** Maximum size for face guide circle on larger devices (tablets) */
const MAX_FACE_GUIDE_SIZE = 400;

/**
 * Calculates the responsive face guide size based on screen dimensions
 * @param {number} width - Screen width in pixels
 * @param {number} height - Screen height in pixels
 * @returns {number} The calculated face guide size capped at MAX_FACE_GUIDE_SIZE
 */
const calculateFaceGuideSize = (width: number, height: number): number => {
  // Use the smaller dimension to ensure the circle fits on any orientation
  const smallerDimension = Math.min(width, height);
  // Use 70% of smaller dimension, capped at max size for tablets
  return Math.min(smallerDimension * 0.7, MAX_FACE_GUIDE_SIZE);
};

/**
 * Face scanner screen component for attendance verification
 * @returns {JSX.Element} The scanner screen with camera view and controls
 */
export default function ScannerScreen(): JSX.Element {
  const router = useRouter();
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { settings } = useDeviceContext();

  // Use state for camera facing to ensure proper initialization
  // This fixes a race condition where the camera may initialize with the wrong facing direction
  const [cameraFacing, setCameraFacing] = useState<CameraType>('front');
  const [isCameraReady, setIsCameraReady] = useState(false);

  // Get responsive dimensions
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const faceGuideSize = useMemo(
    () => calculateFaceGuideSize(screenWidth, screenHeight),
    [screenWidth, screenHeight],
  );

  // Animation values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const statusOpacity = useRef(new Animated.Value(1)).current;
  const borderColorAnim = useRef(new Animated.Value(0)).current;

  const [attendanceType, setAttendanceType] = useState<AttendanceType>('CHECK_IN');
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanStatus, setScanStatus] = useState<ScanStatus>({
    state: 'idle',
    message: 'Position your face within the circle',
  });

  /**
   * Toggles between CHECK_IN and CHECK_OUT attendance types
   * @returns {void} Updates the attendance type toggle value and triggers haptics
   */
  const toggleAttendanceType = useCallback(() => {
    setAttendanceType((prev) => (prev === 'CHECK_IN' ? 'CHECK_OUT' : 'CHECK_IN'));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  /**
   * Starts a pulsing animation for the face guide during scanning
   * @returns {void} Initiates the continuous pulse animation loop
   */
  const startPulseAnimation = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [pulseAnim]);

  /**
   * Stops all animations and resets to default state
   * @returns {void} Halts pulse animations and resets scale
   */
  const stopAnimations = useCallback(() => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  /**
   * Animates the border color based on scan result
   * @param {number} toValue - 0 for neutral, 1 for success, 2 for error
   * @returns {void} Starts the border color transition
   */
  const animateBorderColor = useCallback(
    (toValue: number) => {
      Animated.timing(borderColorAnim, {
        toValue,
        duration: 300,
        useNativeDriver: false,
      }).start();
    },
    [borderColorAnim],
  );

  // Request camera permissions on mount if not granted
  useEffect(() => {
    if (!permission) return;
    if (!permission.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // Reset camera state when screen comes into focus
  // This ensures the camera initializes with the correct facing direction
  useFocusEffect(
    useCallback(() => {
      // Reset camera ready state to force re-initialization
      setIsCameraReady(false);
      setCameraFacing('front');

      // Small delay to ensure the camera reinitializes properly
      const timer = setTimeout(() => {
        setIsCameraReady(true);
      }, 100);

      return () => {
        clearTimeout(timer);
        setIsCameraReady(false);
      };
    }, []),
  );

  // Handle animation state based on scan status
  useEffect(() => {
    if (scanStatus.state === 'scanning') {
      startPulseAnimation();
      animateBorderColor(0);
    } else if (scanStatus.state === 'success') {
      stopAnimations();
      animateBorderColor(1);
    } else if (scanStatus.state === 'error') {
      stopAnimations();
      animateBorderColor(2);
    } else {
      stopAnimations();
      animateBorderColor(0);
    }
  }, [scanStatus.state, startPulseAnimation, stopAnimations, animateBorderColor]);

  /**
   * Navigates to the settings screen
   * @returns {void} Opens the settings route for device configuration
   */
  const handleOpenSettings = () => {
    router.push('/(main)/settings');
  };

  /**
   * Captures a photo and verifies the face against the recognition API
   * Records attendance on successful verification
   * @returns {Promise<void>} Resolves after attempting verification and recording attendance
   */
  const handleCapture = async () => {
    if (!cameraRef.current || !settings?.deviceId) {
      setScanStatus({ state: 'error', message: 'Device not linked. Go to Settings.' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsProcessing(true);
    setScanStatus({ state: 'scanning', message: 'Verifying face...' });

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: true,
        skipProcessing: Platform.OS === 'android', // Skip processing on Android for speed
      });

      if (!photo?.base64) {
        setScanStatus({ state: 'error', message: 'Failed to capture image. Try again.' });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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

        const actionText = attendanceType === 'CHECK_IN' ? 'checked in' : 'checked out';

        setScanStatus({
          state: 'success',
          message: `Successfully ${actionText}!`,
          employeeName: displayName || 'Employee',
        });

        // Success haptic feedback
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Reset status after 3 seconds
        setTimeout(() => {
          setScanStatus({
            state: 'idle',
            message: 'Position your face within the circle',
          });
        }, 3000);
      } else {
        setScanStatus({
          state: 'error',
          message: 'Face not recognized. Please try again.',
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

        // Reset status after 2 seconds
        setTimeout(() => {
          setScanStatus({
            state: 'idle',
            message: 'Position your face within the circle',
          });
        }, 2000);
      }
    } catch (error) {
      console.error('Face verification failed:', error);
      setScanStatus({
        state: 'error',
        message: 'Verification failed. Please retry.',
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Interpolate border color based on animation value
  const borderColor = borderColorAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: ['rgba(255, 255, 255, 0.6)', 'rgba(34, 197, 94, 0.9)', 'rgba(239, 68, 68, 0.9)'],
  });

  // Loading state while permissions are being determined
  if (!permission) {
    return (
      <View style={styles.centeredContainer}>
        <Spinner size="lg" />
        <Text style={styles.loadingText}>Initializing camera...</Text>
      </View>
    );
  }

  // Permission denied state
  if (!permission.granted) {
    return (
      <View style={styles.centeredContainer}>
        <View style={styles.permissionCard}>
          <Ionicons name="camera-outline" size={64} color="#6366f1" />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionDescription}>
            We need camera permission to scan faces for attendance verification.
          </Text>
          <Button onPress={requestPermission} className="mt-6 w-full">
            <Button.Label>Grant Permission</Button.Label>
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera View - uses StyleSheet for proper rendering */}
      {/* Key prop forces re-mount when camera facing changes to fix initialization issues */}
      {isCameraReady && (
        <CameraView
          key={`camera-${cameraFacing}`}
          ref={cameraRef}
          style={styles.camera}
          facing={cameraFacing}
          enableTorch={false}
          animateShutter
        />
      )}

      {/* Top Bar - Attendance Type Toggle & Settings */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={[
            styles.attendanceToggle,
            attendanceType === 'CHECK_IN' ? styles.checkInToggle : styles.checkOutToggle,
          ]}
          onPress={toggleAttendanceType}
          activeOpacity={0.8}
        >
          <View style={styles.toggleIndicator}>
            <View
              style={[
                styles.toggleDot,
                { backgroundColor: attendanceType === 'CHECK_IN' ? '#22c55e' : '#ef4444' },
              ]}
            />
          </View>
          <Text style={styles.toggleText}>
            {attendanceType === 'CHECK_IN' ? 'Check-in' : 'Check-out'}
          </Text>
          <Ionicons name="swap-horizontal" size={18} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingsButton} onPress={handleOpenSettings}>
          <Ionicons name="settings-outline" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {/* Face Guide Overlay */}
      <View style={styles.faceGuideContainer}>
        <Animated.View
          style={[
            styles.faceGuideWrapper,
            {
              width: faceGuideSize,
              height: faceGuideSize,
              transform: [{ scale: pulseAnim }],
            },
          ]}
        >
          <Animated.View
            style={[
              styles.faceGuide,
              {
                width: '100%',
                height: '100%',
                borderRadius: faceGuideSize / 2,
                borderColor: borderColor as unknown as string,
              },
            ]}
          >
            {/* Corner accents */}
            <View style={[styles.cornerAccent, styles.cornerTopLeft]} />
            <View style={[styles.cornerAccent, styles.cornerTopRight]} />
            <View style={[styles.cornerAccent, styles.cornerBottomLeft]} />
            <View style={[styles.cornerAccent, styles.cornerBottomRight]} />
          </Animated.View>
        </Animated.View>

        {/* Instruction text below face guide */}
        <Animated.View style={[styles.instructionContainer, { opacity: statusOpacity }]}>
          {scanStatus.state === 'success' && scanStatus.employeeName ? (
            <>
              <Ionicons name="checkmark-circle" size={28} color="#22c55e" />
              <Text style={styles.employeeName}>{scanStatus.employeeName}</Text>
            </>
          ) : scanStatus.state === 'error' ? (
            <Ionicons name="close-circle" size={28} color="#ef4444" />
          ) : scanStatus.state === 'scanning' ? (
            <Spinner size="sm" color="white" />
          ) : null}
          <Text style={styles.instructionText}>{scanStatus.message}</Text>
        </Animated.View>
      </View>

      {/* Bottom Status Card */}
      <View style={styles.bottomContainer}>
        <Card className="bg-background/90 backdrop-blur-md border-default-200">
          <Card.Body className="p-4">
            {/* Device status row */}
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center gap-2">
                <View
                  className={`w-2.5 h-2.5 rounded-full ${settings?.deviceId ? 'bg-success-500' : 'bg-warning-500'}`}
                />
                <Text className="text-foreground text-sm font-medium">
                  {settings?.deviceId
                    ? settings.name || 'Attendance Terminal'
                    : 'Device Not Linked'}
                </Text>
              </View>
              <View className="flex-row items-center gap-1">
                <Ionicons
                  name={settings?.deviceId ? 'checkmark-circle' : 'alert-circle'}
                  size={14}
                  color={settings?.deviceId ? '#22c55e' : '#f59e0b'}
                />
                <Text className="text-foreground-400 text-xs">
                  {settings?.deviceId ? 'Connected' : 'Setup Required'}
                </Text>
              </View>
            </View>

            {/* Scan button */}
            <Button
              onPress={handleCapture}
              isDisabled={isProcessing || !settings?.deviceId}
              variant={attendanceType === 'CHECK_IN' ? 'primary' : 'secondary'}
              className="w-full h-14"
            >
              {isProcessing ? (
                <View className="flex-row items-center gap-3">
                  <Spinner size="sm" color="white" />
                  <Button.Label className="text-lg">Verifying...</Button.Label>
                </View>
              ) : (
                <View className="flex-row items-center gap-2">
                  <Ionicons name="scan" size={22} color="white" />
                  <Button.Label className="text-lg">
                    {attendanceType === 'CHECK_IN' ? 'Scan Check-in' : 'Scan Check-out'}
                  </Button.Label>
                </View>
              )}
            </Button>

            {/* Link device prompt */}
            {!settings?.deviceId && (
              <TouchableOpacity
                onPress={handleOpenSettings}
                className="mt-3 flex-row items-center justify-center gap-1"
              >
                <Ionicons name="link" size={16} color="#f59e0b" />
                <Text className="text-warning-500 text-sm font-medium">
                  Tap to link this device
                </Text>
              </TouchableOpacity>
            )}
          </Card.Body>
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#a1a1aa',
  },
  permissionCard: {
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 340,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fafafa',
    marginTop: 20,
    textAlign: 'center',
  },
  permissionDescription: {
    fontSize: 15,
    color: '#a1a1aa',
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 22,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  attendanceToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 28,
    borderWidth: 1,
  },
  checkInToggle: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderColor: 'rgba(34, 197, 94, 0.6)',
  },
  checkOutToggle: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderColor: 'rgba(239, 68, 68, 0.6)',
  },
  toggleIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  toggleText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  faceGuideContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceGuideWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceGuide: {
    borderWidth: 3,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  cornerAccent: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: 'white',
    borderWidth: 3,
  },
  cornerTopLeft: {
    top: 20,
    left: 20,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 8,
  },
  cornerTopRight: {
    top: 20,
    right: 20,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 8,
  },
  cornerBottomLeft: {
    bottom: 20,
    left: 20,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
  },
  cornerBottomRight: {
    bottom: 20,
    right: 20,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 8,
  },
  instructionContainer: {
    marginTop: 24,
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },
  employeeName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#22c55e',
    textAlign: 'center',
  },
  instructionText: {
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
});
