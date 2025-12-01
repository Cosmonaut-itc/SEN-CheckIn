import type { JSX } from 'react';
import { useEffect } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Divider } from 'heroui-native';

import { useAppForm } from '@/lib/forms';
import { queryKeys } from '@/lib/query-keys';
import { fetchLocationsList } from '@/lib/client-functions';
import { useDeviceContext } from '@/lib/device-context';
import { useAuthContext } from '@/providers/auth-provider';
import { signOut } from '@/lib/auth-client';

export default function SettingsScreen(): JSX.Element {
  const { session } = useAuthContext();
  const { settings, isHydrated, isUpdating, saveRemoteSettings, updateLocalSettings, clearSettings } =
    useDeviceContext();

  const { data: locationsResponse, isPending: isLocationsPending } = useQuery({
    queryKey: queryKeys.locations.list({ limit: 200 }),
    queryFn: () => fetchLocationsList({ limit: 200 }),
  });

  const form = useAppForm({
    defaultValues: {
      name: settings?.name ?? '',
      locationId: settings?.locationId ?? '',
    },
    onSubmit: async ({ value }) => {
      if (!settings?.deviceId) {
        return;
      }

      const updated = await saveRemoteSettings({
        name: value.name,
        locationId: value.locationId || undefined,
      });

      if (updated) {
        await updateLocalSettings({
          name: updated.name,
          locationId: updated.locationId,
          organizationId: updated.organizationId,
          deviceId: updated.deviceId,
        });
      }
    },
  });

  useEffect(() => {
    if (!settings) return;
    form.setFieldValue('name', settings.name);
    form.setFieldValue('locationId', settings.locationId ?? '');
  }, [form, settings]);

  const organizationId = session?.session?.activeOrganizationId ?? '—';
  const organizationName = (session as any)?.session?.organization?.name ?? 'Organization';

  return (
    <ScrollView className="flex-1 bg-background px-4 pt-12" contentInsetAdjustmentBehavior="automatic">
      <Text className="text-3xl font-bold text-foreground mb-2">Device Settings</Text>
      <Text className="text-base text-foreground-500 mb-6">
        Configure this kiosk before scanning. Device linkage and organization context come from the BetterAuth session.
      </Text>

      <Card className="p-5 gap-4">
        <Text className="text-sm text-foreground-500 uppercase tracking-wide">Organization</Text>
        <Text className="text-lg font-semibold text-foreground">{organizationName}</Text>
        <Text className="text-foreground-500">ID: {organizationId}</Text>
        <Divider />

        <form.AppField
          name="name"
          validators={{
            onChange: ({ value }) => (!value.trim() ? 'Name is required' : undefined),
          }}
        >
          {(field) => <field.TextField label="Device name" placeholder="Front desk tablet" />}
        </form.AppField>

        <form.AppField name="locationId">
          {(field) => (
            <field.SelectField
              label="Location"
              placeholder={isLocationsPending ? 'Loading locations...' : 'Select location'}
              options={
                locationsResponse?.data.map((loc) => ({
                  value: loc.id,
                  label: loc.name,
                })) ?? []
              }
              disabled={isLocationsPending}
            />
          )}
        </form.AppField>

        <form.AppForm>
          <form.SubmitButton
            label={settings?.deviceId ? 'Save changes' : 'Link device first'}
            loadingLabel="Saving..."
            className="mt-2"
          />
        </form.AppForm>

        {!isHydrated ? (
          <Text className="text-foreground-500">Loading saved device settings…</Text>
        ) : (
          <Text className="text-foreground-500">
            Device ID: {settings?.deviceId ?? 'Not set. Use login screen.'}
          </Text>
        )}

        <Divider />

        <View className="flex-row gap-3">
          <Button
            variant="destructive"
            className="flex-1"
            isDisabled={isUpdating}
            onPress={async () => {
              await signOut();
              await clearSettings();
            }}
          >
            <Button.Label>Sign out</Button.Label>
          </Button>
          <Button variant="secondary" className="flex-1" onPress={() => clearSettings()}>
            <Button.Label>Clear device cache</Button.Label>
          </Button>
        </View>
      </Card>
    </ScrollView>
  );
}
