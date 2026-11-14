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

<style>
 :global(body) { font-family: system-ui, sans-serif; margin: 0; color: #222; background: white; }
 header { padding: 1rem; border-bottom: 1px solid #aaa; }
 nav { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: .5rem; }
 main { padding: 1rem; max-width: 110rem; margin: auto; }
 :global(button), :global(input), :global(select), :global(textarea) { font: inherit; }
 :global(button) { cursor: pointer; }
 :global(input[type=file]) { max-width: 100%; }
 :global(label) { line-height: 1.8; }
 :global(.gallery) { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
 :global(.gallery article) { min-width: 0; }
 :global(.gallery a) { display: block; }
 :global(.gallery img) { display: block; width: 100%; height: 160px; object-fit: contain; background: #eee; }
 :global(.detail-layout) { display: grid; grid-template-columns: minmax(0, 2fr) minmax(240px, 1fr); gap: 2rem; }
 :global(.image-stack img) { max-width: 100%; height: auto; }
 :global(figure) { margin: 0 0 1rem; }
 :global(.edit-form label:not(.check)), :global(.edit-form textarea), :global(.edit-form input:not([type=checkbox])), :global(.add-image label) { display: block; }
 :global(.edit-form input:not([type=checkbox])), :global(.edit-form textarea) { width: 100%; box-sizing: border-box; }
 :global(.management-row), :global(.inline-form) { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin: .75rem 0; }
 :global(.sr-only) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
 :global(.error) { color: #a00; }
 @media(max-width: 700px) { :global(.detail-layout) { grid-template-columns: 1fr; } }
</style>
