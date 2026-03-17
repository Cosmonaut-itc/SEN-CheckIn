import { createFormHook, createFormHookContexts } from '@tanstack/react-form';
import {
	Button,
	Description,
	FieldError,
	Input,
	Label,
	Select,
	Spinner,
	TextField,
	useThemeColor,
} from 'heroui-native';
import type { Context, JSX } from 'react';
import { useCallback, useMemo, useState } from 'react';
import type { AnyFieldApi, AnyFormApi } from '@tanstack/form-core';
import {
	Modal,
	ScrollView,
	Text,
	TouchableWithoutFeedback,
	View,
	type ViewStyle,
} from 'react-native';

import { PlatformPressable } from '@/components/ui/platform-pressable';
import { i18n } from '@/lib/i18n';

const formContexts = createFormHookContexts();
const CONTINUOUS_CURVE: ViewStyle = { borderCurve: 'continuous' };

export const fieldContext: Context<AnyFieldApi> = formContexts.fieldContext;
export const formContext: Context<AnyFormApi> = formContexts.formContext;
export const useFieldContext = formContexts.useFieldContext;
export const useFormContext = formContexts.useFormContext;

type CommonFieldProps = {
	label: string;
	placeholder?: string;
	description?: string;
	disabled?: boolean;
};

type SelectOption<TValue extends string> = {
	value: TValue;
	label: string;
};

/**
 * Text field wrapper that binds TanStack form state to HeroUI Native TextField.
 *
 * @param props - Field configuration including label, type, and value formatter
 * @returns {JSX.Element} Bound text field with validation UI
 */
export function AppTextField({
	label,
	placeholder,
	description,
	disabled,
	type = 'default',
	onValueChange,
}: CommonFieldProps & {
	type?: 'default' | 'email' | 'numeric';
	onValueChange?: (value: string) => string;
}): JSX.Element {
	const field = useFieldContext();
	const errors = field.state.meta.errors;

	const keyboardType = useMemo(() => {
		if (type === 'email') return 'email-address';
		if (type === 'numeric') return 'numeric';
		return 'default';
	}, [type]);

	return (
		<TextField isDisabled={disabled} isInvalid={errors.length > 0} className="gap-1">
			<Label>{label}</Label>
			<Input
				value={(field.state.value as string) ?? ''}
				onBlur={field.handleBlur}
				onChangeText={(text: string) => {
					const next = onValueChange ? onValueChange(text) : text;
					field.handleChange(next);
				}}
				placeholder={placeholder}
				keyboardType={keyboardType}
				accessibilityLabel={label}
				accessibilityHint={description}
				className="px-4 py-3 rounded-xl text-foreground"
				style={CONTINUOUS_CURVE}
			/>
			{description ? <Description>{description}</Description> : null}
			<FieldError>{errors.join(', ')}</FieldError>
		</TextField>
	);
}

/**
 * SelectField component for form dropdowns using HeroUI Native Select.
 * Uses dialog presentation by default for mobile-optimized selection experience.
 *
 * @param props - Field configuration including label, options, and presentation style
 * @returns JSX Element rendering a styled select dropdown with validation support
 */
export function SelectField<TValue extends string>({
	label,
	placeholder,
	description,
	disabled,
	options,
	presentation = 'dialog',
}: CommonFieldProps & {
	/** Array of options with value and label pairs */
	options: SelectOption<TValue>[];
	/** Presentation mode: dialog (centered modal), popover (floating), or bottom-sheet */
	presentation?: 'dialog' | 'popover' | 'bottom-sheet';
}): JSX.Element {
	const field = useFieldContext();
	const errors = field.state.meta.errors;
	const accentColor = useThemeColor('accent');

	/** Find the currently selected option based on the field value */
	const currentOption = options.find((opt) => opt.value === field.state.value);

	/**
	 * Handle value selection from the dropdown
	 *
	 * @param opt - Selected option object
	 */
	const handleValueChange = (opt: SelectOption<TValue>): void => {
		field.handleChange(opt.value);
	};

	return (
		<View className="gap-1.5">
			<Text className="text-sm font-semibold text-foreground tracking-wide">{label}</Text>
			<Select value={currentOption} onValueChange={handleValueChange} isDisabled={disabled}>
				<Select.Trigger
					variant="outline"
					className="border border-default-200 rounded-xl px-4 py-3.5 bg-content1 active:bg-content2"
					style={CONTINUOUS_CURVE}
				>
					<Select.Value
						placeholder={placeholder ?? i18n.t('Common.selectOption')}
						className="text-base text-foreground"
					/>
				</Select.Trigger>
				<Select.Portal>
					<Select.Overlay className="bg-overlay/80" />
					<Select.Content
						presentation={presentation}
						classNames={
							presentation === 'dialog'
								? {
										wrapper: 'px-5',
										content: 'rounded-2xl bg-background gap-2 shadow-lg',
									}
								: undefined
						}
						className={
							presentation !== 'dialog'
								? 'rounded-2xl bg-background gap-2 shadow-lg'
								: undefined
						}
						style={{
							borderCurve: 'continuous',
						}}
					>
						{presentation === 'dialog' && <Select.Close />}
						{presentation === 'dialog' && label ? (
							<Select.ListLabel className="text-lg font-bold text-foreground">
								{label}
							</Select.ListLabel>
						) : null}
						{options.map((opt) => (
							<Select.Item
								key={opt.value}
								value={opt.value}
								label={opt.label}
								className="px-4 py-3.5 rounded-xl active:bg-content2"
								style={CONTINUOUS_CURVE}
							>
								<View className="flex-row items-center gap-3 flex-1">
									<Select.ItemLabel className="text-base text-foreground flex-1" />
								</View>
								<Select.ItemIndicator
									iconProps={{
										size: 20,
										color: accentColor,
									}}
								/>
							</Select.Item>
						))}
					</Select.Content>
				</Select.Portal>
			</Select>
			{description ? (
				<Text className="text-sm text-foreground-400 leading-5">{description}</Text>
			) : null}
			{errors.length > 0 ? (
				<Text className="text-sm text-danger-500 font-medium" selectable>
					{errors.join(', ')}
				</Text>
			) : null}
		</View>
	);
}

/**
 * Native select alternative using ActionSheet (iOS) or a simple modal list (other platforms).
 *
 * @param props - Field configuration including label, options, and placeholder text
 * @returns JSX Element rendering a native-friendly picker with validation support
 */
export function NativeSelectField<TValue extends string>({
	label,
	placeholder,
	description,
	disabled,
	options,
}: CommonFieldProps & {
	/** Array of options with value and label pairs */
	options: { value: TValue; label: string }[];
}): JSX.Element {
	const field = useFieldContext();
	const errors = field.state.meta.errors;
	const [isModalVisible, setIsModalVisible] = useState(false);

	/** Currently selected option derived from the form value */
	const currentOption = useMemo(
		() => options.find((opt) => opt.value === field.state.value) ?? null,
		[field.state.value, options],
	);

	/**
	 * Apply the selected value and close any open picker UI.
	 *
	 * @param value - Selected option value
	 */
	const handleSelectValue = useCallback(
		(value: TValue): void => {
			field.handleChange(value);
			setIsModalVisible(false);
		},
		[field],
	);

	/**
	 * Open the picker modal.
	 */
	const handleOpenPicker = useCallback((): void => {
		if (disabled) {
			return;
		}

		setIsModalVisible(true);
	}, [disabled]);

	const placeholderText = placeholder ?? i18n.t('Common.selectOption');
	const displayLabel = currentOption?.label ?? placeholderText;
	const isPlaceholder = !currentOption;

	return (
		<View className="gap-1.5">
			<Text className="text-sm font-semibold text-foreground tracking-wide">{label}</Text>
			<PlatformPressable
				className="border border-default-200 rounded-xl px-4 py-3.5 bg-content1"
				disabled={disabled}
				onPress={handleOpenPicker}
				hitSlop={8}
				style={CONTINUOUS_CURVE}
			>
				<Text
					className={`text-base ${isPlaceholder ? 'text-foreground-400' : 'text-foreground'}`}
				>
					{displayLabel}
				</Text>
			</PlatformPressable>
			{description ? (
				<Text className="text-sm text-foreground-400 leading-5">{description}</Text>
			) : null}
			{errors.length > 0 ? (
				<Text className="text-sm text-danger-500 font-medium" selectable>
					{errors.join(', ')}
				</Text>
			) : null}

			<Modal
				transparent
				animationType="fade"
				visible={isModalVisible}
				onRequestClose={() => setIsModalVisible(false)}
			>
				<View className="flex-1 bg-overlay/80 px-6 justify-center">
					<TouchableWithoutFeedback onPress={() => setIsModalVisible(false)}>
						<View className="absolute inset-0" />
					</TouchableWithoutFeedback>

					<View
						className="bg-background rounded-2xl p-4 gap-3"
						style={[{ maxHeight: '70%' }, CONTINUOUS_CURVE]}
					>
						<Text className="text-base font-semibold text-foreground">{label}</Text>
						<ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
							{options.length === 0 ? (
								<Text className="text-foreground-400 py-4">
									{i18n.t('Common.noOptionsAvailable')}
								</Text>
							) : (
								options.map((opt) => {
									const isSelected = opt.value === field.state.value;
									return (
										<PlatformPressable
											key={opt.value}
											pressedOpacity={0.85}
											className="py-3 px-2 rounded-lg flex-row items-center justify-between"
											onPress={() => handleSelectValue(opt.value)}
											style={CONTINUOUS_CURVE}
										>
											<Text className="text-base text-foreground">
												{opt.label}
											</Text>
											{isSelected ? (
												<Text className="text-primary font-semibold">
													●
												</Text>
											) : null}
										</PlatformPressable>
									);
								})
							)}
						</ScrollView>
						<PlatformPressable
							pressedOpacity={0.85}
							className="py-3 rounded-xl border border-default-200 items-center"
							onPress={() => setIsModalVisible(false)}
							style={CONTINUOUS_CURVE}
						>
							<Text className="text-foreground font-semibold">
								{i18n.t('Common.cancel')}
							</Text>
						</PlatformPressable>
					</View>
				</View>
			</Modal>
		</View>
	);
}

/**
 * Submit button that reacts to form submission state.
 *
 * @param props - Button labels and optional className
 * @returns {JSX.Element} Submit button wired to form state
 */
export function SubmitButton({
	label,
	loadingLabel = i18n.t('Common.saving'),
	className,
}: {
	label: string;
	loadingLabel?: string;
	className?: string;
}): JSX.Element {
	const form = useFormContext();

	return (
		<form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
			{([canSubmit, isSubmitting]) => (
				<Button
					variant="primary"
					className={className}
					isDisabled={!canSubmit || isSubmitting}
					onPress={() => form.handleSubmit()}
				>
					{isSubmitting ? (
						<View className="flex-row items-center gap-2">
							<Spinner size="sm" />
							<Button.Label>{loadingLabel}</Button.Label>
						</View>
					) : (
						<Button.Label>{label}</Button.Label>
					)}
				</Button>
			)}
		</form.Subscribe>
	);
}

const fieldComponents = {
	TextField: AppTextField,
	SelectField,
	NativeSelectField,
} as const;

const formComponents = {
	SubmitButton,
} as const;

type FormHook = ReturnType<typeof createFormHook<typeof fieldComponents, typeof formComponents>>;

const formHook: FormHook = createFormHook<typeof fieldComponents, typeof formComponents>({
	fieldContext,
	formContext,
	fieldComponents,
	formComponents,
});

export const useAppForm: FormHook['useAppForm'] = formHook.useAppForm;
export const withForm: FormHook['withForm'] = formHook.withForm;
