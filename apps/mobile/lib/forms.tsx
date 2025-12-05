import { createFormHook, createFormHookContexts } from '@tanstack/react-form';
import { Button, Select, Spinner, TextField } from 'heroui-native';
import type { JSX } from 'react';
import { useMemo } from 'react';
import { Text, View } from 'react-native';

export const { fieldContext, formContext, useFieldContext, useFormContext } =
	createFormHookContexts();

type CommonFieldProps = {
	label: string;
	placeholder?: string;
	description?: string;
	disabled?: boolean;
};

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
			<TextField.Label>{label}</TextField.Label>
			<TextField.Input
				value={(field.state.value as string) ?? ''}
				onBlur={field.handleBlur}
				onChangeText={(text: string) => {
					const next = onValueChange ? onValueChange(text) : text;
					field.handleChange(next);
				}}
				placeholder={placeholder}
				keyboardType={keyboardType}
			/>
			{description ? <TextField.Description>{description}</TextField.Description> : null}
			{errors.length > 0 ? (
				<TextField.ErrorMessage>{errors.join(', ')}</TextField.ErrorMessage>
			) : null}
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
	options: { value: TValue; label: string }[];
	/** Presentation mode: dialog (centered modal), popover (floating), or bottom-sheet */
	presentation?: 'dialog' | 'popover' | 'bottom-sheet';
}): JSX.Element {
	const field = useFieldContext();
	const errors = field.state.meta.errors;

	/** Find the currently selected option based on the field value */
	const currentOption = options.find((opt) => opt.value === field.state.value) ?? null;

	/**
	 * Handle value selection from the dropdown
	 *
	 * @param opt - Selected option object or null when cleared
	 */
	const handleValueChange = (opt: { value: string; label: string } | null): void => {
		if (opt?.value) {
			field.handleChange(opt.value as TValue);
		}
	};

	return (
		<View className="gap-1.5">
			<Text className="text-sm font-semibold text-foreground tracking-wide">{label}</Text>
			<Select
				value={
					currentOption
						? { value: currentOption.value, label: currentOption.label }
						: undefined
				}
				onValueChange={handleValueChange}
				isDisabled={disabled}
			>
				<Select.Trigger className="border border-default-200 rounded-xl px-4 py-3.5 bg-content1 active:bg-content2">
					<Select.Value
						placeholder={placeholder ?? 'Select an option'}
						className="text-base text-foreground"
					/>
				</Select.Trigger>
				<Select.Portal>
					<Select.Overlay className="bg-black/40" />
					<Select.Content
						presentation={presentation}
						classNames={
							presentation === 'dialog'
								? {
										wrapper: 'px-5',
										content: 'rounded-2xl bg-background shadow-xl',
									}
								: undefined
						}
						className={
							presentation !== 'dialog'
								? 'rounded-2xl bg-background shadow-xl'
								: undefined
						}
					>
						{presentation === 'dialog' && <Select.Close />}
						{presentation === 'dialog' && label ? (
							<Select.ListLabel className="text-lg font-bold text-foreground mb-2">
								{label}
							</Select.ListLabel>
						) : null}
						{options.map((opt) => (
							<Select.Item
								key={opt.value}
								value={opt.value}
								label={opt.label}
								className="px-4 py-3 rounded-xl active:bg-content2"
							>
								<View className="flex-row items-center justify-between flex-1">
									<Select.ItemLabel className="text-base text-foreground" />
									<Select.ItemIndicator />
								</View>
							</Select.Item>
						))}
					</Select.Content>
				</Select.Portal>
			</Select>
			{description ? (
				<Text className="text-sm text-foreground-400 leading-5">{description}</Text>
			) : null}
			{errors.length > 0 ? (
				<Text className="text-sm text-danger-500 font-medium">{errors.join(', ')}</Text>
			) : null}
		</View>
	);
}

export function SubmitButton({
	label,
	loadingLabel = 'Saving...',
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

export const { useAppForm, withForm } = createFormHook({
	fieldContext,
	formContext,
	fieldComponents: {
		TextField: AppTextField,
		SelectField,
	},
	formComponents: {
		SubmitButton,
	},
});
