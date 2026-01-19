import { Href, Link } from 'expo-router';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import type { ComponentProps, JSX } from 'react';

type Props = Omit<ComponentProps<typeof Link>, 'href'> & { href: Href & string };

/**
 * Render an external link that opens in an in-app browser on native platforms.
 *
 * @param props - Link props including the href to open
 * @returns {JSX.Element} Link element configured for external navigation
 */
export function ExternalLink({ href, ...rest }: Props): JSX.Element {
	return (
		<Link
			target="_blank"
			rel="noopener noreferrer"
			{...rest}
			href={href}
			onPress={async (event) => {
				if (process.env.EXPO_OS !== 'web') {
					// Prevent the default behavior of linking to the default browser on native.
					event.preventDefault();
					// Open the link in an in-app browser.
					await openBrowserAsync(href, {
						presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
					});
				}
			}}
		/>
	);
}
