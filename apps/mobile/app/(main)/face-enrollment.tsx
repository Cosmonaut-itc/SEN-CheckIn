import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { type Href, useNavigation, useRouter } from 'expo-router';
import { Button, Card, Input, Spinner, useThemeColor } from 'heroui-native';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/empty-state';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
	fetchFaceEnrollmentEmployees,
	fullEnrollmentFlow,
	isFaceEnrollmentApiError,
	type FaceEnrollmentApiErrorCode,
	type FaceEnrollmentEmployee,
} from '@/lib/client-functions';
import { useDeviceContext } from '@/lib/device-context';
import { i18n } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';
import { BODY_TEXT_CLASS_NAME } from '@/lib/typography';

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
};

const ENROLLMENT_API_ERROR_TRANSLATION_KEYS: Record<FaceEnrollmentApiErrorCode, string> = {
	REKOGNITION_USER_EXISTS: 'FaceEnrollment.errors.api.REKOGNITION_USER_EXISTS',
	REKOGNITION_USER_MISSING: 'FaceEnrollment.errors.api.REKOGNITION_USER_MISSING',
	INVALID_IMAGE_BASE64: 'FaceEnrollment.errors.api.INVALID_IMAGE_BASE64',
	EMPLOYEE_NOT_FOUND: 'FaceEnrollment.errors.api.EMPLOYEE_NOT_FOUND',
	EMPLOYEE_FORBIDDEN: 'FaceEnrollment.errors.api.EMPLOYEE_FORBIDDEN',
	REKOGNITION_USER_CREATE_FAILED: 'FaceEnrollment.errors.api.REKOGNITION_USER_CREATE_FAILED',
	REKOGNITION_INDEX_FAILED: 'FaceEnrollment.errors.api.REKOGNITION_INDEX_FAILED',
	UNKNOWN: 'FaceEnrollment.errors.api.UNKNOWN',
};

const LOCAL_ENROLLMENT_ERROR_KEYS = [
	'FaceEnrollment.errors.associationFailed',
	'FaceEnrollment.errors.captureFailed',
	'FaceEnrollment.errors.cameraUnavailable',
	'FaceEnrollment.errors.missingData',
] as const;

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
	if (isFaceEnrollmentApiError(error)) {
		return i18n.t(ENROLLMENT_API_ERROR_TRANSLATION_KEYS[error.code]);
	}

	if (error instanceof Error) {
		const localMessages = LOCAL_ENROLLMENT_ERROR_KEYS.map((key) => i18n.t(key));
		if (localMessages.includes(error.message)) {
			return error.message;
		}
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
	const navigation = useNavigation();
	const insets = useSafeAreaInsets();
	const queryClient = useQueryClient();
	const iconColor = useThemeColor('foreground');
	const mutedForegroundColor = useThemeColor('muted-foreground');
	const successColor = useThemeColor('success');
	const warningColor = useThemeColor('warning');
	const cameraRef = useRef<CameraView | null>(null);
	const inputBorderRadius = useMemo(
		() => Platform.select({ ios: 10, android: 12, default: 10 }),
		[],
	);
	const cardBorderRadius = useMemo(
		() => Platform.select({ ios: 14, android: 16, default: 14 }),
		[],
	);
	const [cameraFacing, setCameraFacing] = useState<CameraType>('front');
	const [permission, requestPermission] = useCameraPermissions();
	const [searchTerm, setSearchTerm] = useState<string>('');
	const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
	const [capturedPhoto, setCapturedPhoto] = useState<CapturedFacePhoto | null>(null);
	const [capturedEmployeeId, setCapturedEmployeeId] = useState<string | null>(null);
	const [enrollmentSummary, setEnrollmentSummary] = useState<EnrollmentSummary | null>(null);
	const [submissionError, setSubmissionError] = useState<string | null>(null);
	const { settings } = useDeviceContext();
	const organizationId = settings?.organizationId ?? null;
	const isDeviceLinked = Boolean(settings?.deviceId);
	const hasLocationConfigured = Boolean(settings?.locationId);
	const hasDeviceConfig = isDeviceLinked && hasLocationConfigured;
	const keyboardVerticalOffset = Platform.OS === 'ios' ? Math.max(insets.top, 16) : 0;
	const employeeQueryParams = useMemo(
		() => ({
			limit: EMPLOYEE_FETCH_LIMIT,
			organizationId,
		}),
		[organizationId],
	);

	const employeesQuery = useQuery({
		queryKey: queryKeys.faceEnrollment.employees(employeeQueryParams),
		queryFn: () => fetchFaceEnrollmentEmployees(employeeQueryParams),
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
		() =>
			filteredEmployees.find((employee) => employee.id === selectedEmployeeId) ??
			null,
		[filteredEmployees, selectedEmployeeId],
	);
	const capturedEmployee = useMemo(
		() => employees.find((employee) => employee.id === capturedEmployeeId) ?? null,
		[employees, capturedEmployeeId],
	);

	useEffect(() => {
		if (!selectedEmployeeId) {
			return;
		}

		const isSelectedEmployeeVisible = filteredEmployees.some(
			(employee) => employee.id === selectedEmployeeId,
		);
		if (!isSelectedEmployeeVisible) {
			setSelectedEmployeeId(null);
		}
	}, [filteredEmployees, selectedEmployeeId]);

	const isListTruncated =
		(employeesQuery.data?.pagination.total ?? 0) > (employeesQuery.data?.data.length ?? 0);
	const showEmployeesEmptyState =
		!employeesQuery.isPending && !employeesQuery.isError && filteredEmployees.length === 0;

	const enrollmentMutation = useMutation({
		mutationKey: queryKeys.faceEnrollment.flow(),
		mutationFn: async (): Promise<void> => {
			if (!capturedEmployee || !capturedPhoto) {
				throw new Error(i18n.t('FaceEnrollment.errors.missingData'));
			}

			const result = await fullEnrollmentFlow({
				employeeId: capturedEmployee.id,
				imageBase64: capturedPhoto.base64,
				hasRekognitionUser: Boolean(capturedEmployee.rekognitionUserId),
			});

			if (!result.success || !result.associated) {
				throw new Error(i18n.t('FaceEnrollment.errors.associationFailed'));
			}

			setCapturedPhoto(null);
			setCapturedEmployeeId(null);
			setEnrollmentSummary({
				employeeId: capturedEmployee.id,
				employeeName: `${capturedEmployee.firstName} ${capturedEmployee.lastName}`,
				faceId: result.faceId,
				wasReEnrollment: Boolean(capturedEmployee.rekognitionUserId),
			});
			await queryClient.invalidateQueries({ queryKey: queryKeys.faceEnrollment.all });
		},
		onError: (error: unknown) => {
			setSubmissionError(resolveEnrollmentErrorMessage(error));
		},
	});
	const isEmployeeSelectionLocked = Boolean(capturedPhoto) || enrollmentMutation.isPending;

	/**
	 * Captures a photo from the current camera feed and opens preview mode.
	 *
	 * @returns Promise that resolves when capture completes
	 */
	const handleCapturePhoto = useCallback(async (): Promise<void> => {
		setSubmissionError(null);
		if (!cameraRef.current || !selectedEmployee) {
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
			setCapturedEmployeeId(selectedEmployee.id);
		} catch {
			setSubmissionError(i18n.t('FaceEnrollment.errors.captureFailed'));
		}
	}, [selectedEmployee]);

	/**
	 * Executes the full enrollment flow against the API.
	 *
	 * @returns Promise that resolves when enrollment request finishes
	 */
	const handleConfirmEnrollment = useCallback(async (): Promise<void> => {
		setSubmissionError(null);
		try {
			await enrollmentMutation.mutateAsync();
		} catch (error: unknown) {
			setSubmissionError((current) => current ?? resolveEnrollmentErrorMessage(error));
		}
	}, [enrollmentMutation]);

	/**
	 * Clears local state to register a different employee.
	 *
	 * @returns No return value
	 */
	const handleRegisterAnother = useCallback((): void => {
		setEnrollmentSummary(null);
		setCapturedPhoto(null);
		setCapturedEmployeeId(null);
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
		if (navigation.canGoBack()) {
			navigation.goBack();
			return;
		}

		router.replace(SCANNER_ROUTE);
	}, [navigation, router]);

	/**
	 * Opens the settings screen to complete device linkage configuration.
	 *
	 * @returns No return value
	 */
	const handleOpenSettings = useCallback((): void => {
		router.push(SETTINGS_ROUTE);
	}, [router]);

	const contentBottomPadding = Math.max(28, insets.bottom + 20);
	const floatingBackButtonSize = 48;
	const floatingBackButtonTop = Math.max(8, insets.top + 8);
	const floatingBackButtonLeft = 16;
	const contentTopPadding = floatingBackButtonTop + floatingBackButtonSize + 16;

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
		<KeyboardAvoidingView
			className="flex-1 bg-background"
			behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
			keyboardVerticalOffset={keyboardVerticalOffset}
		>
			<View className="flex-1 bg-background">
				<ScrollView
					className="flex-1 bg-background"
					contentInsetAdjustmentBehavior="never"
					contentContainerClassName="px-4 gap-4"
					contentContainerStyle={{
						paddingTop: contentTopPadding,
						paddingBottom: contentBottomPadding,
					}}
					keyboardShouldPersistTaps="handled"
				>
				<Text className={`${BODY_TEXT_CLASS_NAME} text-foreground-500`} selectable>
					{i18n.t('FaceEnrollment.subtitle')}
				</Text>

				{!hasDeviceConfig ? (
					<Card variant="default">
						<Card.Body className="p-5 gap-3">
							<View className="flex-row items-center gap-2">
								<IconSymbol
									name="exclamationmark.triangle.fill"
									size={18}
									color={warningColor}
								/>
								<Card.Title>{i18n.t('FaceEnrollment.device.title')}</Card.Title>
							</View>
							<Card.Description selectable>
								{isDeviceLinked
									? i18n.t('FaceEnrollment.device.locationRequired')
									: i18n.t('FaceEnrollment.device.linkRequired')}
							</Card.Description>
							<Button variant="primary" onPress={handleOpenSettings}>
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
								<IconSymbol
									name="checkmark.seal.fill"
									size={22}
									color={successColor}
								/>
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
							<Text className="text-foreground-500 text-sm" selectable>
								{i18n.t('FaceEnrollment.success.description')}
							</Text>
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
								<Button
									variant="primary"
									className="flex-1"
									onPress={handleBackToScanner}
								>
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
								<Text className="text-sm font-semibold text-foreground tracking-wide">
									{i18n.t('FaceEnrollment.employees.searchLabel')}
								</Text>
								<Input
									value={searchTerm}
									onChangeText={setSearchTerm}
									placeholder={i18n.t(
										'FaceEnrollment.employees.searchPlaceholder',
									)}
									placeholderTextColor={mutedForegroundColor}
									className="bg-input border border-default-200 text-foreground px-4 py-3"
									style={{ borderRadius: inputBorderRadius }}
									accessibilityLabel={i18n.t(
										'FaceEnrollment.employees.searchPlaceholder',
									)}
									accessibilityHint={i18n.t('FaceEnrollment.employees.searchHint')}
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
								<ScrollView
									className="max-h-72"
									contentContainerClassName="gap-2"
									contentInsetAdjustmentBehavior="never"
									nestedScrollEnabled
									keyboardShouldPersistTaps="handled"
									showsVerticalScrollIndicator={false}
								>
									{showEmployeesEmptyState ? (
										<EmptyState
											title={i18n.t('FaceEnrollment.employees.emptyState.title')}
											description={i18n.t(
												'FaceEnrollment.employees.emptyState.description',
											)}
											actionLabel={i18n.t(
												'FaceEnrollment.employees.emptyState.clearSearch',
											)}
											onAction={() => setSearchTerm('')}
											icon={
												<IconSymbol
													name="magnifyingglass"
													size={20}
													color={mutedForegroundColor}
												/>
											}
										/>
									) : null}
									{filteredEmployees.map((employee) => {
										const isSelected = selectedEmployeeId === employee.id;
										const isRegistered = Boolean(employee.rekognitionUserId);
										return (
											<Button
												key={employee.id}
												variant={isSelected ? 'primary' : 'secondary'}
												isDisabled={isEmployeeSelectionLocked}
												onPress={() => setSelectedEmployeeId(employee.id)}
												accessibilityLabel={`${employee.firstName} ${employee.lastName}`}
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
								</ScrollView>
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
										accessibilityLabel={i18n.t(
											'FaceEnrollment.camera.switchCamera',
										)}
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
										<Button variant="primary" onPress={requestPermission}>
											<Button.Label>
												{i18n.t('FaceEnrollment.permission.grant')}
											</Button.Label>
										</Button>
									</View>
								) : capturedPhoto ? (
									<View className="gap-3">
										<View
											className="overflow-hidden border border-default-200"
											style={{ width: '100%', height: 260, borderRadius: cardBorderRadius }}
										>
											<Image
												source={{ uri: capturedPhoto.previewUri }}
												style={{ width: '100%', height: '100%' }}
												contentFit="cover"
												accessibilityLabel={i18n.t(
													'FaceEnrollment.camera.previewLabel',
												)}
											/>
										</View>
										<View className="flex-row gap-2">
											<Button
												variant="secondary"
												className="flex-1"
												onPress={() => {
													setCapturedPhoto(null);
													setCapturedEmployeeId(null);
												}}
												isDisabled={enrollmentMutation.isPending}
												accessibilityLabel={i18n.t(
													'FaceEnrollment.actions.retake',
												)}
											>
												<Button.Label>
													{i18n.t('FaceEnrollment.actions.retake')}
												</Button.Label>
											</Button>
											<Button
												variant="primary"
												className="flex-1"
												onPress={handleConfirmEnrollment}
												isDisabled={
													enrollmentMutation.isPending ||
													!capturedEmployee
												}
												accessibilityLabel={
													enrollmentMutation.isPending
														? i18n.t(
																'FaceEnrollment.actions.submitting',
															)
														: i18n.t('FaceEnrollment.actions.confirm')
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
										<View
											className="overflow-hidden border border-default-200"
											style={{ width: '100%', height: 260, borderRadius: cardBorderRadius }}
										>
											<CameraView
												ref={cameraRef}
												facing={cameraFacing}
												style={{ width: '100%', height: '100%' }}
											/>
										</View>
										<Button
											variant="primary"
											onPress={handleCapturePhoto}
											isDisabled={
												!selectedEmployee || enrollmentMutation.isPending
											}
											accessibilityLabel={i18n.t('FaceEnrollment.actions.capture')}
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

			<View
				pointerEvents="box-none"
				style={{
					position: 'absolute',
					top: floatingBackButtonTop,
					left: floatingBackButtonLeft,
					zIndex: 30,
				}}
			>
				<Button
					variant="secondary"
					isIconOnly
					size="md"
					className="w-12 h-12 rounded-full"
					accessibilityLabel={i18n.t('FaceEnrollment.actions.backToScanner')}
					onPress={handleBackToScanner}
				>
					<IconSymbol name="chevron.left" size={22} color={iconColor} />
				</Button>
			</View>
			</View>
		</KeyboardAvoidingView>
	);
}
