import type { JSX } from 'react';
import { useMemo } from 'react';
import { createFormHook, createFormHookContexts } from '@tanstack/react-form';
import { Text, View } from 'react-native';
import { Button, Select, TextField, Spinner } from 'heroui-native';

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

export function SelectField<TValue extends string>({
  label,
  placeholder,
  description,
  disabled,
  options,
}: CommonFieldProps & {
  options: { value: TValue; label: string }[];
}): JSX.Element {
  const field = useFieldContext();
  const errors = field.state.meta.errors;

  const currentOption = options.find((opt) => opt.value === field.state.value) ?? null;

  return (
    <View className="gap-1">
      <Text className="text-base font-medium text-foreground">{label}</Text>
      <Select
        value={
          currentOption ? { value: currentOption.value, label: currentOption.label } : undefined
        }
        onValueChange={(opt) => field.handleChange((opt?.value as TValue) ?? null)}
        isDisabled={disabled}
      >
        <Select.Trigger className="border border-default-200 rounded-xl px-3 py-3 bg-content1">
          <Select.Value placeholder={placeholder ?? 'Select an option'} />
        </Select.Trigger>
        <Select.Content presentation="bottom-sheet">
          {options.map((opt: { value: TValue; label: string }) => (
            <Select.Item key={opt.value} value={opt.value} label={opt.label} />
          ))}
        </Select.Content>
      </Select>
      {description ? <Text className="text-sm text-foreground-500">{description}</Text> : null}
      {errors.length > 0 ? (
        <Text className="text-sm text-danger-500">{errors.join(', ')}</Text>
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
