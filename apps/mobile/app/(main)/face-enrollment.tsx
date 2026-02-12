import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { type Href, Stack, useRouter } from 'expo-router';
import { Button, Card, Spinner } from 'heroui-native';
import type { JSX } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import {
	fetchFaceEnrollmentEmployees,
	fullEnrollmentFlow,
	isFaceEnrollmentApiError,
	type FaceEnrollmentEmployee,
} from '@/lib/client-functions';
import { useDeviceContext } from '@/lib/device-context';
import { i18n } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';

const SCANNER_ROUTE = '/(main)/scanner' as Href;
const SETTINGS_ROUTE = '/(main)/settings' as Href;
const EMPLOYEE_FETCH_LIMIT = 200;
const EMPTY_EMPLOYEES: FaceEnrollmentEmployee[] = [];

/**
 * Captured photo payload used for preview and API enrollment.
 */
type CapturedFacePhoto = {
	/** Data URL for preview rendering */
	previewUri: string;
	/** Raw base64 image payload for API */
	base64: string;
};

/**
 * Summary payload displayed after successful enrollment.
 */
type EnrollmentSummary = {
	/** Employee identifier */
	employeeId: string;
	/** Employee display name */
	employeeName: string;
	/** Face identifier returned by Rekognition */
	faceId: string | null;
	/** Whether employee already had a Rekognition user */
	wasReEnrollment: boolean;
	/** API success message when provided */
	message?: string;
};

/**
 * Builds a searchable normalized label for employee local filtering.
 *
 * @param employee - Employee record to index
 * @returns Normalized text used in search matching
 */
function buildEmployeeSearchIndex(employee: FaceEnrollmentEmployee): string {
	return `${employee.firstName} ${employee.lastName} ${employee.code}`.toLowerCase();
}

/**
 * Resolves a user-friendly error message for enrollment failures.
 *
 * @param error - Unknown error thrown by async operations
 * @returns Localized error message for UI rendering
 */
function resolveEnrollmentErrorMessage(error: unknown): string {
	if (isFaceEnrollmentApiError(error) && error.message) {
		return error.message;
	}

	if (error instanceof Error && error.message) {
		return error.message;
	}

	return i18n.t('FaceEnrollment.errors.generic');
}

/**
 * Face enrollment screen for employee registration and re-registration from mobile.
 *
 * @returns Dedicated mobile enrollment UI with employee selection and camera flow
 */
export default function FaceEnrollmentScreen(): JSX.Element {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const queryClient = useQueryClient();
	const cameraRef = useRef<CameraView | null>(null);
	const [cameraFacing, setCameraFacing] = useState<CameraType>('front');
	const [permission, requestPermission] = useCameraPermissions();
	const [searchTerm, setSearchTerm] = useState<string>('');
	const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
	const [capturedPhoto, setCapturedPhoto] = useState<CapturedFacePhoto | null>(null);
	const [enrollmentSummary, setEnrollmentSummary] = useState<EnrollmentSummary | null>(null);
	const [submissionError, setSubmissionError] = useState<string | null>(null);
	const { settings } = useDeviceContext();
	const isDeviceLinked = Boolean(settings?.deviceId);
	const hasLocationConfigured = Boolean(settings?.locationId);
	const hasDeviceConfig = isDeviceLinked && hasLocationConfigured;

	const employeesQuery = useQuery({
		queryKey: queryKeys.faceEnrollment.employees({ limit: EMPLOYEE_FETCH_LIMIT }),
		queryFn: () => fetchFaceEnrollmentEmployees({ limit: EMPLOYEE_FETCH_LIMIT }),
		enabled: hasDeviceConfig,
	});

	const employees = useMemo(
		() => employeesQuery.data?.data ?? EMPTY_EMPLOYEES,
		[employeesQuery.data?.data],
	);

	const filteredEmployees = useMemo(() => {
		const normalizedTerm = searchTerm.trim().toLowerCase();
		if (!normalizedTerm) {
			return employees;
		}

		return employees.filter((employee) =>
			buildEmployeeSearchIndex(employee).includes(normalizedTerm),
		);
	}, [employees, searchTerm]);

	const selectedEmployee = useMemo(
		() => employees.find((employee) => employee.id === selectedEmployeeId) ?? null,
		[employees, selectedEmployeeId],
	);

	const isListTruncated =
		(employeesQuery.data?.pagination.total ?? 0) > (employeesQuery.data?.data.length ?? 0);

	const enrollmentMutation = useMutation({
		mutationKey: queryKeys.faceEnrollment.flow(),
		mutationFn: async (): Promise<void> => {
			if (!selectedEmployee || !capturedPhoto) {
				throw new Error(i18n.t('FaceEnrollment.errors.missingData'));
			}

			const result = await fullEnrollmentFlow({
				employeeId: selectedEmployee.id,
				imageBase64: capturedPhoto.base64,
				hasRekognitionUser: Boolean(selectedEmployee.rekognitionUserId),
			});

			if (!result.success) {
				throw new Error(result.message ?? i18n.t('FaceEnrollment.errors.generic'));
			}

			setCapturedPhoto(null);
			setEnrollmentSummary({
				employeeId: selectedEmployee.id,
				employeeName: `${selectedEmployee.firstName} ${selectedEmployee.lastName}`,
				faceId: result.faceId,
				wasReEnrollment: Boolean(selectedEmployee.rekognitionUserId),
				message: result.message,
			});
			await queryClient.invalidateQueries({ queryKey: queryKeys.faceEnrollment.all });
		},
		onError: (error: unknown) => {
			setSubmissionError(resolveEnrollmentErrorMessage(error));
		},
	});

	/**
	 * Captures a photo from the current camera feed and opens preview mode.
	 *
	 * @returns Promise that resolves when capture completes
	 */
	const handleCapturePhoto = useCallback(async (): Promise<void> => {
		setSubmissionError(null);
		if (!cameraRef.current) {
			setSubmissionError(i18n.t('FaceEnrollment.errors.cameraUnavailable'));
			return;
		}

		try {
			const photo = await cameraRef.current.takePictureAsync({
				quality: 0.7,
				base64: true,
				skipProcessing: process.env.EXPO_OS === 'android',
			});

			if (!photo?.base64) {
				setSubmissionError(i18n.t('FaceEnrollment.errors.captureFailed'));
				return;
			}

			setCapturedPhoto({
				previewUri: `data:image/jpeg;base64,${photo.base64}`,
				base64: photo.base64,
			});
		} catch {
			setSubmissionError(i18n.t('FaceEnrollment.errors.captureFailed'));
		}
	}, []);

	/**
	 * Executes the full enrollment flow against the API.
	 *
	 * @returns Promise that resolves when enrollment request finishes
	 */
	const handleConfirmEnrollment = useCallback(async (): Promise<void> => {
		setSubmissionError(null);
		await enrollmentMutation.mutateAsync();
	}, [enrollmentMutation]);

	/**
	 * Clears local state to register a different employee.
	 *
	 * @returns No return value
	 */
	const handleRegisterAnother = useCallback((): void => {
		setEnrollmentSummary(null);
		setCapturedPhoto(null);
		setSearchTerm('');
		setSelectedEmployeeId(null);
		setSubmissionError(null);
	}, []);

	/**
	 * Toggles camera facing between front and back lenses.
	 *
	 * @returns No return value
	 */
	const handleToggleCamera = useCallback((): void => {
		setCameraFacing((previous) => (previous === 'front' ? 'back' : 'front'));
	}, []);

	/**
	 * Navigates back to the scanner screen.
	 *
	 * @returns No return value
	 */
	const handleBackToScanner = useCallback((): void => {
		router.replace(SCANNER_ROUTE);
	}, [router]);

	/**
	 * Opens the settings screen to complete device linkage configuration.
	 *
	 * @returns No return value
	 */
	const handleOpenSettings = useCallback((): void => {
		router.push(SETTINGS_ROUTE);
	}, [router]);

	const contentBottomPadding = Math.max(28, insets.bottom + 20);

	if (!permission) {
		return (
			<View className="flex-1 bg-background items-center justify-center px-6">
				<Spinner size="lg" />
				<Text className="text-foreground-500 mt-3" selectable>
					{i18n.t('FaceEnrollment.permission.loading')}
				</Text>
			</View>
		);
	}

	return (
		<>
			<Stack.Screen options={{ title: i18n.t('FaceEnrollment.title'), headerShown: true }} />
			<ScrollView
				className="flex-1 bg-background"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerClassName="px-4 gap-4"
				contentContainerStyle={{ paddingBottom: contentBottomPadding }}
			>
				<Text className="text-foreground-500 text-sm" selectable>
					{i18n.t('FaceEnrollment.subtitle')}
				</Text>

				{!hasDeviceConfig ? (
					<Card variant="default">
						<Card.Body className="p-5 gap-3">
							<View className="flex-row items-center gap-2">
								<IconSymbol
									name="exclamationmark.triangle.fill"
									size={18}
									color="#f59e0b"
								/>
								<Card.Title>{i18n.t('FaceEnrollment.device.title')}</Card.Title>
							</View>
							<Card.Description selectable>
								{isDeviceLinked
									? i18n.t('FaceEnrollment.device.locationRequired')
									: i18n.t('FaceEnrollment.device.linkRequired')}
							</Card.Description>
							<Button onPress={handleOpenSettings}>
								<Button.Label>
									{i18n.t('FaceEnrollment.device.openSettings')}
								</Button.Label>
							</Button>
						</Card.Body>
					</Card>
				) : null}

				{enrollmentSummary ? (
					<Card variant="default">
						<Card.Body className="p-5 gap-3">
							<View className="flex-row items-center gap-2">
								<IconSymbol name="checkmark.seal.fill" size={22} color="#22c55e" />
								<Card.Title>{i18n.t('FaceEnrollment.success.title')}</Card.Title>
							</View>
							<Text className="text-foreground" selectable>
								{i18n.t('FaceEnrollment.success.employee', {
									name: enrollmentSummary.employeeName,
								})}
							</Text>
							<Text className="text-foreground-500 text-sm" selectable>
								{i18n.t('FaceEnrollment.success.mode', {
									mode: enrollmentSummary.wasReEnrollment
										? i18n.t('FaceEnrollment.success.reEnrollment')
										: i18n.t('FaceEnrollment.success.newEnrollment'),
								})}
							</Text>
							{enrollmentSummary.message ? (
								<Text className="text-foreground-500 text-sm" selectable>
									{enrollmentSummary.message}
								</Text>
							) : null}
							<View className="flex-row gap-2">
								<Button
									variant="secondary"
									className="flex-1"
									onPress={handleRegisterAnother}
								>
									<Button.Label>
										{i18n.t('FaceEnrollment.actions.registerAnother')}
									</Button.Label>
								</Button>
								<Button className="flex-1" onPress={handleBackToScanner}>
									<Button.Label>
										{i18n.t('FaceEnrollment.actions.backToScanner')}
									</Button.Label>
								</Button>
							</View>
						</Card.Body>
					</Card>
				) : null}

				{hasDeviceConfig && !enrollmentSummary ? (
					<>
						<Card variant="default">
							<Card.Body className="p-5 gap-3">
								<Card.Title>{i18n.t('FaceEnrollment.employees.title')}</Card.Title>
								<TextInput
									value={searchTerm}
									onChangeText={setSearchTerm}
									placeholder={i18n.t(
										'FaceEnrollment.employees.searchPlaceholder',
									)}
									placeholderTextColor="rgba(115,115,115,0.9)"
									className="bg-content2 text-foreground rounded-xl px-3 py-3"
									accessibilityLabel={i18n.t(
										'FaceEnrollment.employees.searchPlaceholder',
									)}
								/>
								{employeesQuery.isPending ? (
									<View className="items-center py-5 gap-2">
										<Spinner size="sm" />
										<Text className="text-foreground-500" selectable>
											{i18n.t('FaceEnrollment.employees.loading')}
										</Text>
									</View>
								) : null}
								{employeesQuery.isError ? (
									<Text className="text-danger-500 text-sm" selectable>
										{i18n.t('FaceEnrollment.employees.loadError')}
									</Text>
								) : null}
								{isListTruncated ? (
									<Text className="text-warning-500 text-sm" selectable>
										{i18n.t('FaceEnrollment.employees.truncatedWarning', {
											limit: EMPLOYEE_FETCH_LIMIT,
										})}
									</Text>
								) : null}
								<View className="gap-2 max-h-72">
									{filteredEmployees.length === 0 && !employeesQuery.isPending ? (
										<Text className="text-foreground-500 text-sm" selectable>
											{i18n.t('FaceEnrollment.employees.empty')}
										</Text>
									) : null}
									{filteredEmployees.map((employee) => {
										const isSelected = selectedEmployeeId === employee.id;
										const isRegistered = Boolean(employee.rekognitionUserId);
										return (
											<Button
												key={employee.id}
												variant={isSelected ? 'primary' : 'secondary'}
												onPress={() => setSelectedEmployeeId(employee.id)}
											>
												<View className="flex-row items-center justify-between gap-2 w-full">
													<View className="flex-1">
														<Text
															className="text-foreground font-semibold"
															selectable
														>
															{employee.firstName} {employee.lastName}
														</Text>
														<Text
															className="text-foreground-500 text-xs"
															selectable
														>
															{employee.code}
														</Text>
													</View>
													<View
														className={`px-2.5 py-1 rounded-full ${isRegistered ? 'bg-success-500/15' : 'bg-default-200'}`}
													>
														<Text
															className={`text-xs font-semibold ${isRegistered ? 'text-success-600' : 'text-foreground-500'}`}
															selectable
														>
															{isRegistered
																? i18n.t(
																		'FaceEnrollment.employees.badges.registered',
																	)
																: i18n.t(
																		'FaceEnrollment.employees.badges.notRegistered',
																	)}
														</Text>
													</View>
												</View>
											</Button>
										);
									})}
								</View>
							</Card.Body>
						</Card>

						<Card variant="default">
							<Card.Body className="p-5 gap-3">
								<View className="flex-row items-center justify-between">
									<Card.Title>{i18n.t('FaceEnrollment.camera.title')}</Card.Title>
									<Button
										variant="secondary"
										size="sm"
										onPress={handleToggleCamera}
										isDisabled={Boolean(capturedPhoto)}
									>
										<Button.Label>
											{i18n.t('FaceEnrollment.camera.switchCamera')}
										</Button.Label>
									</Button>
								</View>

								{!permission.granted ? (
									<View className="gap-3">
										<Text className="text-foreground-500" selectable>
											{i18n.t('FaceEnrollment.permission.description')}
										</Text>
										<Button onPress={requestPermission}>
											<Button.Label>
												{i18n.t('FaceEnrollment.permission.grant')}
											</Button.Label>
										</Button>
									</View>
								) : capturedPhoto ? (
									<View className="gap-3">
										<Image
											source={{ uri: capturedPhoto.previewUri }}
											style={{ width: '100%', height: 260, borderRadius: 16 }}
											contentFit="cover"
										/>
										<View className="flex-row gap-2">
											<Button
												variant="secondary"
												className="flex-1"
												onPress={() => setCapturedPhoto(null)}
												isDisabled={enrollmentMutation.isPending}
											>
												<Button.Label>
													{i18n.t('FaceEnrollment.actions.retake')}
												</Button.Label>
											</Button>
											<Button
												className="flex-1"
												onPress={handleConfirmEnrollment}
												isDisabled={
													enrollmentMutation.isPending ||
													!selectedEmployee
												}
											>
												<Button.Label>
													{enrollmentMutation.isPending
														? i18n.t(
																'FaceEnrollment.actions.submitting',
															)
														: i18n.t('FaceEnrollment.actions.confirm')}
												</Button.Label>
											</Button>
										</View>
									</View>
								) : (
									<View className="gap-3">
										<CameraView
											ref={cameraRef}
											facing={cameraFacing}
											style={{ width: '100%', height: 260, borderRadius: 16 }}
										/>
										<Button
											onPress={handleCapturePhoto}
											isDisabled={
												!selectedEmployee || enrollmentMutation.isPending
											}
										>
											<Button.Label>
												{i18n.t('FaceEnrollment.actions.capture')}
											</Button.Label>
										</Button>
									</View>
								)}

								{submissionError ? (
									<Text className="text-danger-500 text-sm" selectable>
										{submissionError}
									</Text>
								) : null}
							</Card.Body>
						</Card>
					</>
				) : null}
			</ScrollView>
		</>
	);
}
