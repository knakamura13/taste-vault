<script lang="ts">
	import { resolve } from '$app/paths';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<header>
	<a href={resolve('/')}>Taste Vault</a>
	<nav aria-label="Vault">
		<a href={resolve('/')}>All References</a>
		<a href={resolve('/references/new')}>Add Reference</a>
		<a href={resolve('/projects')}>Projects</a>
		<a href={resolve('/categories')}>Categories</a>
		<a href={resolve('/trash')}>Trash</a>
	</nav>
</header>

<main>
	{@render children()}
</main>
