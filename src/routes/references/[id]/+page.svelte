<script>
 import { tick } from 'svelte';
 import { enhance } from '$app/forms';
 import { invalidate } from '$app/navigation';
 let { data, form } = $props();
 /** @type {HTMLFormElement} */ let editForm;

 // Capture the editable values for this history entry, including assignments.
 export const snapshot = {
  capture: () => Array.from(new FormData(editForm), ([name, value]) => [name, String(value)]),
  /** @param {[string, string][]} values */
  restore: (values) => {
   const draft = new URLSearchParams(values);
   for (const field of editForm.querySelectorAll('input, textarea')) {
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) continue;
    if (field instanceof HTMLInputElement && field.type === 'checkbox') {
     field.checked = draft.getAll(field.name).includes(field.value);
    } else if (draft.has(field.name)) {
     field.value = draft.get(field.name) ?? '';
    }
   }
  }
 };

 /** @type {import('$app/forms').SubmitFunction} */
 const saveDetails = () => {
  const draft = snapshot.capture();
  return async ({ update, result }) => {
   await update({ reset: false, navigate: false });
   if (result.type === 'failure') {
    await tick();
    snapshot.restore(/** @type {[string,string][]} */ (draft));
   }
  };
 };
 let capturePending = $derived(['queued', 'running'].includes(data.ref.capture?.status));

 $effect(() => {
  if (!capturePending) return;
  let active = true;
  let timer = setTimeout(refresh, 2500);

  async function refresh() {
   try {
    await invalidate('taste:capture');
   } catch {
    // Try again on the next interval if the connection is temporarily unavailable.
   } finally {
    if (active) timer = setTimeout(refresh, 2500);
   }
  }

  return () => {
   active = false;
   clearTimeout(timer);
  };
 });
</script>
<svelte:head><title>{data.ref.title} · Taste Vault</title></svelte:head>
<a class="back" href={data.galleryUrl}>← All references</a><div class="page-heading"><div><p class="eyebrow">{data.ref.reference_id}</p><h1>{data.ref.title}</h1></div><form method="POST" action="?/trash" onsubmit={(e)=>{if(!confirm('Move this reference to Trash?')) e.preventDefault();}}><button class="secondary">Move to Trash</button></form></div>
{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}{#if form?.success}<p class="notice" role="status">{form.success}</p>{/if}
{#if data.ref.source_url}<p><a href={data.ref.source_url}>Open source page</a></p>{/if}
{#if data.ref.capture}<p role="status">Capture: {data.ref.capture.status}{data.ref.capture.error ? ` — ${data.ref.capture.error}` : ''}</p>{#if data.ref.capture.status==='failed'}<form method="POST" action="?/retry"><button>Retry capture</button></form>{/if}{/if}
<div class="detail-layout"><section aria-label="Screenshots"><div class="image-stack">{#each data.ref.screenshots as screenshot}<figure><img src="/assets/{screenshot.id}" alt={data.ref.title}><details><summary>Image description</summary><form method="POST" action="?/description"><input type="hidden" name="screenshot" value={screenshot.id}><label>Approved description<textarea name="description" rows="4">{screenshot.description || ''}</textarea></label><button class="secondary">Save description</button></form></details><figcaption>{screenshot.filename}{#if screenshot.sourceKind==='wayback'} · <a href={screenshot.pageUrl}>Archive replay ({screenshot.archiveTimestamp})</a>{/if}{#if screenshot.capturedAt} · Captured {new Date(screenshot.capturedAt).toISOString()}{/if}</figcaption></figure>{:else}<div class="empty image-placeholder">No screenshot yet</div>{/each}</div>
<details class="add-image"><summary>Add screenshot</summary><form method="POST" action="?/upload" enctype="multipart/form-data"><label>Image<input type="file" name="screenshot" accept="image/png,image/jpeg,image/webp" required></label><label class="check"><input type="checkbox" name="confirmDuplicate"> Add even if already saved</label><button>Add screenshot</button></form></details></section>
<aside><form method="POST" action="?/save" class="edit-form" bind:this={editForm} use:enhance={saveDetails}><h2>Details</h2><label>Title<input name="title" value={data.ref.title} required maxlength="200"></label><label>Source URL<input type="url" name="sourceUrl" value={data.ref.source_url || ''}></label><label>Notes<textarea name="notes" rows="5">{data.ref.notes}</textarea></label><label>Tags <span class="muted">comma separated</span><input name="tags" value={data.ref.tags.join(', ')}></label><fieldset><legend>Projects</legend>{#each data.projects as project}<label class="check"><input type="checkbox" name="projects" value={project.id} checked={data.ref.project_ids.includes(project.id)}>{project.name}{project.archived_at ? ' (archived)' : ''}</label>{:else}<p class="muted">No projects yet.</p>{/each}</fieldset><fieldset><legend>Categories</legend>{#each data.categories as category}<label class="check"><input type="checkbox" name="categories" value={category.id} checked={data.ref.category_ids.includes(category.id)}>{category.name}</label>{:else}<p class="muted">No categories yet.</p>{/each}</fieldset><button>Save changes</button></form></aside></div>
