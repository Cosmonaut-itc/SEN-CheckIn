"use client";

import * as React from "react";
import { format } from "date-fns";
import { Plus, Trash2, Key, Copy, Eye, EyeOff, Check } from "lucide-react";
import { Header } from "@/components/header";
import { DataTable, type Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { authClient } from "@/lib/auth-client";

/**
 * API key interface representing an API key record.
 */
interface ApiKey {
	id: string;
	name: string | null;
	start: string | null;
	prefix: string | null;
	enabled: boolean;
	expiresAt: string | Date | null;
	createdAt: string | Date;
	lastRequest: string | Date | null;
	requestCount: number;
}

/**
 * Form data interface for creating API keys.
 */
interface ApiKeyFormData {
	name: string;
	expiresIn: string;
}

/**
 * API Keys page component.
 * Provides management for API access keys using better-auth.
 *
 * @returns Rendered API keys page
 */
export default function ApiKeysPage(): React.JSX.Element {
	const { toast } = useToast();
	const [apiKeys, setApiKeys] = React.useState<ApiKey[]>([]);
	const [isLoading, setIsLoading] = React.useState<boolean>(true);

	// Dialog states
	const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState<boolean>(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState<boolean>(false);
	const [isKeyDialogOpen, setIsKeyDialogOpen] = React.useState<boolean>(false);
	const [selectedKey, setSelectedKey] = React.useState<ApiKey | null>(null);
	const [newKeyValue, setNewKeyValue] = React.useState<string>("");
	const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
	const [showKey, setShowKey] = React.useState<boolean>(false);
	const [copied, setCopied] = React.useState<boolean>(false);

	// Form state
	const [formData, setFormData] = React.useState<ApiKeyFormData>({
		name: "",
		expiresIn: "30",
	});

	/**
	 * Fetches API keys from better-auth.
	 */
	const fetchApiKeys = React.useCallback(async (): Promise<void> => {
		setIsLoading(true);
		try {
			const { data, error } = await authClient.apiKey.list();

			if (error) {
				toast({
					title: "Error",
					description: "Failed to fetch API keys",
					variant: "destructive",
				});
				return;
			}

			if (data) {
				setApiKeys(data as unknown as ApiKey[]);
			}
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to fetch API keys",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	}, [toast]);

	React.useEffect(() => {
		fetchApiKeys();
	}, [fetchApiKeys]);

	/**
	 * Resets form data to initial state.
	 */
	const resetForm = (): void => {
		setFormData({
			name: "",
			expiresIn: "30",
		});
	};

	/**
	 * Handles creating a new API key.
	 */
	const handleCreate = async (): Promise<void> => {
		setIsSubmitting(true);
		try {
			const expiresIn = parseInt(formData.expiresIn, 10) * 24 * 60 * 60; // days to seconds

			const { data, error } = await authClient.apiKey.create({
				name: formData.name || undefined,
				expiresIn: expiresIn > 0 ? expiresIn : undefined,
			});

			if (error) {
				toast({
					title: "Error",
					description: "Failed to create API key",
					variant: "destructive",
				});
				return;
			}

			if (data?.key) {
				setNewKeyValue(data.key);
				setIsCreateDialogOpen(false);
				setIsKeyDialogOpen(true);
				resetForm();
				fetchApiKeys();
			}
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to create API key",
				variant: "destructive",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	/**
	 * Handles revoking an API key.
	 */
	const handleRevoke = async (): Promise<void> => {
		if (!selectedKey) return;

		setIsSubmitting(true);
		try {
			const { error } = await authClient.apiKey.delete({
				keyId: selectedKey.id,
			});

			if (error) {
				toast({
					title: "Error",
					description: "Failed to revoke API key",
					variant: "destructive",
				});
				return;
			}

			toast({
				title: "Success",
				description: "API key revoked successfully",
			});
			setIsDeleteDialogOpen(false);
			setSelectedKey(null);
			fetchApiKeys();
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to revoke API key",
				variant: "destructive",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	/**
	 * Opens the delete confirmation dialog.
	 */
	const openDeleteDialog = (key: ApiKey): void => {
		setSelectedKey(key);
		setIsDeleteDialogOpen(true);
	};

	/**
	 * Copies the new key to clipboard.
	 */
	const copyToClipboard = async (): Promise<void> => {
		try {
			await navigator.clipboard.writeText(newKeyValue);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
			toast({
				title: "Copied!",
				description: "API key copied to clipboard",
			});
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to copy to clipboard",
				variant: "destructive",
			});
		}
	};

	/**
	 * Masks the key value for display.
	 */
	const maskKey = (key: string): string => {
		if (key.length <= 8) return "••••••••";
		return `${key.slice(0, 4)}${"•".repeat(key.length - 8)}${key.slice(-4)}`;
	};

	/**
	 * Column definitions for the data table.
	 */
	const columns: Column<ApiKey>[] = [
		{
			key: "name",
			header: "Name",
			cell: (key) => (
				<div className="flex items-center gap-2">
					<Key className="h-4 w-4 text-muted-foreground" />
					<span className="font-medium">{key.name ?? "Unnamed Key"}</span>
				</div>
			),
		},
		{
			key: "prefix",
			header: "Key Prefix",
			cell: (key) => (
				<span className="font-mono text-sm text-muted-foreground">
					{key.start ?? key.prefix ?? "—"}...
				</span>
			),
		},
		{
			key: "status",
			header: "Status",
			cell: (key) =>
				key.enabled ? (
					<Badge variant="success">Active</Badge>
				) : (
					<Badge variant="secondary">Disabled</Badge>
				),
		},
		{
			key: "requestCount",
			header: "Requests",
			cell: (key) => key.requestCount ?? 0,
		},
		{
			key: "lastRequest",
			header: "Last Used",
			cell: (key) =>
				key.lastRequest
					? format(new Date(key.lastRequest), "MMM d, yyyy h:mm a")
					: "Never",
		},
		{
			key: "expiresAt",
			header: "Expires",
			cell: (key) =>
				key.expiresAt
					? format(new Date(key.expiresAt), "MMM d, yyyy")
					: "Never",
		},
		{
			key: "createdAt",
			header: "Created",
			cell: (key) => format(new Date(key.createdAt), "MMM d, yyyy"),
		},
		{
			key: "actions",
			header: "Actions",
			cell: (key) => (
				<Button
					variant="ghost"
					size="icon"
					onClick={(e) => {
						e.stopPropagation();
						openDeleteDialog(key);
					}}
				>
					<Trash2 className="h-4 w-4 text-destructive" />
				</Button>
			),
		},
	];

	return (
		<>
			<Header title="API Keys" />
			<div className="p-6 space-y-6">
				{/* Info Card */}
				<Card>
					<CardHeader>
						<CardTitle>API Key Management</CardTitle>
						<CardDescription>
							Create and manage API keys for programmatic access to the Sen Checkin
							API. Keep your keys secure and never share them publicly.
						</CardDescription>
					</CardHeader>
				</Card>

				{/* Toolbar */}
				<div className="flex items-center justify-end">
					<Button
						onClick={() => {
							resetForm();
							setIsCreateDialogOpen(true);
						}}
					>
						<Plus className="h-4 w-4 mr-2" />
						Create API Key
					</Button>
				</div>

				{/* Data Table */}
				<DataTable
					columns={columns}
					data={apiKeys}
					isLoading={isLoading}
					keyExtractor={(key) => key.id}
					emptyMessage="No API keys found. Create one to get started."
				/>
			</div>

			{/* Create Dialog */}
			<Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Create API Key</DialogTitle>
						<DialogDescription>
							Create a new API key for programmatic access. The key will only be
							shown once after creation.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="name">Key Name (optional)</Label>
							<Input
								id="name"
								value={formData.name}
								onChange={(e) =>
									setFormData({ ...formData, name: e.target.value })
								}
								placeholder="My API Key"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="expiresIn">Expiration (days)</Label>
							<Input
								id="expiresIn"
								type="number"
								min="0"
								value={formData.expiresIn}
								onChange={(e) =>
									setFormData({ ...formData, expiresIn: e.target.value })
								}
								placeholder="30 (0 for no expiration)"
							/>
							<p className="text-xs text-muted-foreground">
								Set to 0 for a key that never expires
							</p>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setIsCreateDialogOpen(false)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button onClick={handleCreate} disabled={isSubmitting}>
							{isSubmitting ? "Creating..." : "Create Key"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* New Key Display Dialog */}
			<Dialog open={isKeyDialogOpen} onOpenChange={setIsKeyDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>API Key Created</DialogTitle>
						<DialogDescription>
							Copy your API key now. You won&apos;t be able to see it again!
						</DialogDescription>
					</DialogHeader>
					<div className="py-4">
						<div className="flex items-center gap-2 p-3 bg-muted rounded-md">
							<code className="flex-1 font-mono text-sm break-all">
								{showKey ? newKeyValue : maskKey(newKeyValue)}
							</code>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => setShowKey(!showKey)}
							>
								{showKey ? (
									<EyeOff className="h-4 w-4" />
								) : (
									<Eye className="h-4 w-4" />
								)}
							</Button>
							<Button variant="ghost" size="icon" onClick={copyToClipboard}>
								{copied ? (
									<Check className="h-4 w-4 text-green-500" />
								) : (
									<Copy className="h-4 w-4" />
								)}
							</Button>
						</div>
					</div>
					<DialogFooter>
						<Button
							onClick={() => {
								setIsKeyDialogOpen(false);
								setNewKeyValue("");
								setShowKey(false);
							}}
						>
							Done
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Revoke Confirmation Dialog */}
			<Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Revoke API Key</DialogTitle>
						<DialogDescription>
							Are you sure you want to revoke the API key{" "}
							<strong>{selectedKey?.name ?? "Unnamed Key"}</strong>? This action
							cannot be undone and any applications using this key will lose access.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setIsDeleteDialogOpen(false)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={handleRevoke}
							disabled={isSubmitting}
						>
							{isSubmitting ? "Revoking..." : "Revoke Key"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
