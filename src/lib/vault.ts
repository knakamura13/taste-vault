export type ReferenceId = `REF-${number}`;

export interface Project {
	id: string;
	name: string;
	archivedAt: string | null;
}

export interface Category {
	id: string;
	name: string;
}

export interface RepoLink {
	repoRoot: string;
	projectId: Project['id'];
}

export interface Reference {
	id: ReferenceId;
	title: string;
	sourceUrl: string | null;
	notes: string;
	tags: string[];
	projectIds: Project['id'][];
	categoryIds: Category['id'][];
	screenshots: Screenshot[];
	createdAt: string;
	updatedAt: string;
	trashedAt: string | null;
}

export interface Screenshot {
	id: string;
	storageKey: string;
	contentHash: string;
	source: ScreenshotSource;
	description: ApprovedDescription | null;
}

export type ScreenshotSource =
	| { kind: 'upload'; filename: string }
	| { kind: 'live'; pageUrl: string; capturedAt: string }
	| { kind: 'wayback'; replayUrl: string; archivedAt: string; capturedAt: string };

export interface ApprovedDescription {
	text: string;
	approvedAt: string;
}

export interface CaptureJob {
	id: string;
	referenceId: ReferenceId;
	sourceUrl: string;
	status: CaptureStatus;
}

export type CaptureStatus =
	| { kind: 'queued' }
	| { kind: 'running'; source: 'live' | 'wayback' }
	| { kind: 'succeeded'; screenshotId: Screenshot['id'] }
	| { kind: 'failed'; reason: string };
