import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({
	subsets: ["latin"],
	variable: "--font-inter",
});

/**
 * Root metadata for the Sen Checkin admin portal.
 */
export const metadata: Metadata = {
	title: "Sen Checkin - Admin Portal",
	description: "Admin dashboard for managing employees, attendance, and devices",
};

/**
 * Root layout component for the Next.js application.
 * Provides global font configuration and toast notifications.
 *
 * @param children - The page content to render
 * @returns The root HTML structure with providers
 */
export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>): React.JSX.Element {
	return (
		<html lang="en" suppressHydrationWarning>
			<body className={`${inter.variable} font-sans antialiased`}>
				{children}
				<Toaster />
			</body>
		</html>
	);
}
