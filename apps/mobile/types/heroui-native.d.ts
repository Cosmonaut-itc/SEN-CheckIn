/**
 * Type augmentation for heroui-native package.
 *
 * This file exists because TypeScript's NodeNext module resolution
 * has trouble resolving the package's exports. We simply re-export
 * everything from the package's actual type definitions.
 */
declare module 'heroui-native' {
	// Re-export all components
	export { Button } from 'heroui-native/lib/typescript/src/components/button';
	export { Card } from 'heroui-native/lib/typescript/src/components/card';
	export { Divider } from 'heroui-native/lib/typescript/src/components/divider';
	export { Select } from 'heroui-native/lib/typescript/src/components/select';
	export { Spinner } from 'heroui-native/lib/typescript/src/components/spinner';
	export { TextField } from 'heroui-native/lib/typescript/src/components/text-field';
	export { Toast } from 'heroui-native/lib/typescript/src/components/toast';
	// Re-export theme helpers
	export { useThemeColor } from 'heroui-native/lib/typescript/src/helpers/theme';
	// Re-export providers
	export { HeroUINativeProvider } from 'heroui-native/lib/typescript/src/providers/hero-ui-native';
	export { ToastProvider, useToast } from 'heroui-native/lib/typescript/src/providers/toast';
}
