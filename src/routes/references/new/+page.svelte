<script>
 import { enhance } from '$app/forms';
 import { onMount } from 'svelte';

 const recoveryPrefix = 'taste:intake-recovery:';
 /** @typedef {{ id: string, startedAt: number, checking: boolean, message: string, referenceId: string }} PreviousBatch */
 /** @type {PreviousBatch[]} */
 let previousBatches = $state([]);

 onMount(() => {
  try {
   previousBatches = Object.keys(localStorage)
    .filter(key => key.startsWith(recoveryPrefix))
    .map(key => ({
     id: key.slice(recoveryPrefix.length),
     startedAt: Number(localStorage.getItem(key)),
     checking: false,
     message: '',
     referenceId: ''
    }))
    .filter(batch => /^[\da-f-]{36}$/i.test(batch.id) && Number.isFinite(batch.startedAt) && batch.startedAt > 0)
    .sort((a,b) => b.startedAt - a.startedAt);
  } catch {
   // The open form can still check its receipt when browser storage is unavailable.
  }
 });

 /** @param {string} id */
 function rememberBatch(id) {
  try { localStorage.setItem(recoveryPrefix + id, String(Date.now())); } catch {}
 }

 /** @param {string} id */
 function forgetBatch(id) {
  try { localStorage.removeItem(recoveryPrefix + id); } catch {}
  previousBatches = previousBatches.filter(batch => batch.id !== id);
 }

 /** @param {PreviousBatch} batch */
 async function checkPreviousBatch(batch) {
  batch.checking = true;
  batch.message = '';
  try {
   const response = await fetch('/references/new/receipt/' + batch.id);
   if (response.ok) {
    batch.referenceId = (await response.json()).referenceId;
   } else if (response.status === 404) {
    batch.message = 'No completed save found. Check again if the upload may still be finishing.';
   } else {
    batch.message = 'Could not check the batch. Try checking again.';
   }
  } catch {
   batch.message = 'Could not check the batch. Try checking again.';
  } finally {
   batch.checking = false;
  }
 }

 let { data, form } = $props();
 /** @type {FileList | undefined} */ let files = $state();
 let grouped = $state(false);
 let urls = $state('');
 let pages = $derived(urls.split(/\r?\n/).map(x=>x.trim()).filter(Boolean));
 let submitting = $state(false);
 let submissionError = $state('');
 let receipt = $state('');
 let uncertain = $state(false);
 let checking = $state(false);
 let savedReference = $state('');

 async function checkReceipt() {
  checking = true;
  try {
   const response = await fetch('/references/new/receipt/' + receipt);
   if (response.ok) {
    savedReference = (await response.json()).referenceId;
    submissionError = 'This batch was saved.';
   } else if (response.status === 404) {
    submissionError = 'No completed save found. You can retry this batch safely.';
   } else {
    submissionError = 'Could not check the batch. Try checking again.';
   }
  } catch {
   submissionError = 'Could not check the batch. Try checking again.';
  } finally {
   checking = false;
  }
 }

 /** @type {import('$app/forms').SubmitFunction} */
 function submitBatch({ cancel, formData }) {
  if (files && (files.length > 20 || Array.from(files).some(file => file.size > 10 * 1024 * 1024))) {
   cancel();
   submissionError = 'Choose up to 20 images, each no larger than 10 MB. Remove oversized images below before saving.';
   return;
  }
  if (submitting) {
   cancel();
   return;
  }
  receipt ||= crypto.randomUUID();
  const submittedReceipt = receipt;
  formData.set('receipt', submittedReceipt);
  rememberBatch(submittedReceipt);
  uncertain = false;
  submitting = true;
  submissionError = '';

  return async ({ result, update }) => {
   try {
    if (result.type === 'error') {
     uncertain = true;
     submissionError = 'Could not confirm whether the batch saved. Check before changing the batch.';
     return;
    }
    forgetBatch(submittedReceipt);
    await update({ reset: false });
   } finally {
    submitting = false;
   }
  };
 }
 /** @param {File} removed */
 function removeFile(removed) {
  const remaining = new DataTransfer();
  for (const file of Array.from(files ?? [])) if (file !== removed) remaining.items.add(file);
  files = remaining.files;
  submissionError = '';
 }
</script>
<svelte:head><title>Add Reference · Taste Vault</title></svelte:head><h1>Add references</h1>
<p>Add screenshots, URLs, or both. Images become separate references unless grouped; listed URLs become separate references and are queued for capture.</p>
<noscript><p>With JavaScript disabled, a submission error reloads this page. Re-enter your batch and reselect any screenshots before retrying.</p></noscript>
{#if form?.error}<p role="alert">{form.error}</p>{#if form.duplicates?.length}<ul>{#each form.duplicates as duplicate}<li><a href="/references/REF-{String(duplicate.id).padStart(6,'0')}">{duplicate.title}</a></li>{/each}</ul>{/if}{/if}
{#if submissionError}<p role="alert">{submissionError}</p>{/if}
{#if savedReference}<p><a href="/references/{savedReference}" onclick={() => forgetBatch(receipt)}>Open saved batch</a></p>
{:else if uncertain}<p><button type="button" onclick={checkReceipt} disabled={checking}>Check saved batch</button></p>{/if}
{#if previousBatches.length}
 <section aria-labelledby="previous-batches">
  <h2 id="previous-batches">Previous uploads</h2>
  <p>Check whether an earlier upload saved. To start a new upload, select your files again.</p>
  <ul>
   {#each previousBatches as batch (batch.id)}
    <li>
     <time datetime={new Date(batch.startedAt).toISOString()}>{new Date(batch.startedAt).toLocaleString()}</time>
     {#if batch.referenceId}
      <a href="/references/{batch.referenceId}" onclick={() => forgetBatch(batch.id)}>Open previous batch</a>
     {:else}
      <button type="button" onclick={() => checkPreviousBatch(batch)} disabled={batch.checking}>Check previous batch</button>
     {/if}
     <button type="button" onclick={() => forgetBatch(batch.id)}>Dismiss</button>
     {#if batch.message}<p role="status">{batch.message}</p>{/if}
    </li>
   {/each}
  </ul>
 </section>
{/if}
<form method="POST" enctype="multipart/form-data" use:enhance={submitBatch} aria-busy={submitting}>
<p><label>Screenshots <input type="file" name="screenshots" accept="image/png,image/jpeg,image/webp" multiple bind:files></label> (up to 20 images, 10 MB each)</p>
{#if files?.length}<ul aria-label="Selected screenshots">{#each Array.from(files) as file (file)}<li>{file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB){file.size > 10 * 1024 * 1024 ? ' — exceeds 10 MB' : ''} <button type="button" disabled={submitting} onclick={() => removeFile(file)} aria-label={'Remove '+file.name}>Remove</button></li>{/each}</ul>{/if}
<p><label>Page URLs (one per line)<br><textarea name="urls" rows="4" bind:value={urls}></textarea></label></p>
<fieldset><legend>Batch defaults</legend><p><label>Title <input name="title" maxlength="200"></label></p><p><label>Project <select name="project"><option value="">General</option>{#each data.projects as project}{#if !project.archived_at}<option value={project.id}>{project.name}</option>{/if}{/each}</select></label></p><p><label>Source URL for screenshots <input name="sourceUrl" type="url"></label></p><fieldset><legend>Categories</legend>{#each data.categories as category}<label><input type="checkbox" name="categories" value={category.id}>{category.name}</label> {/each}</fieldset><p><label>Tags (comma separated) <input name="tags"></label></p><p><label>Notes <textarea name="notes" maxlength="10000"></textarea></label></p></fieldset>
<p><label><input type="checkbox" name="group" bind:checked={grouped}> Group all screenshots under one reference</label></p>
{#if files?.length && !grouped}<h2>Screenshot overrides</h2>{#each Array.from(files) as file, i (file)}<details><summary>{file.name}</summary><p><label>Group label <input name={'image_'+i+'_group'} maxlength="80" placeholder="Optional"></label> <small>Use the same label to group screenshots. Grouped items must share their overrides.</small></p><p><label>Title <input name={'image_'+i+'_title'} maxlength="200" placeholder="Use batch default"></label></p><label>Project <select name={'image_'+i+'_project'}><option value="default">Use batch default</option><option value="">General</option>{#each data.projects as project}{#if !project.archived_at}<option value={project.id}>{project.name}</option>{/if}{/each}</select></label><p><label>Source <select name={'image_'+i+'_source_mode'}><option value="default">Use batch default</option><option value="none">No source</option><option value="custom">Use URL below</option></select></label> <input name={'image_'+i+'_source'} type="url" aria-label={'Source URL for '+file.name}></p><p><label>Categories <select name={'image_'+i+'_category_mode'}><option value="default">Use batch default</option><option value="none">None</option><option value="custom">Use selections below</option></select></label></p>{#each data.categories as category}<label><input type="checkbox" name={'image_'+i+'_categories'} value={category.id}>{category.name}</label> {/each}</details>{/each}{/if}
{#if pages.length}<h2>URL overrides</h2>{#each pages as page, i}<details><summary>{page}</summary><p><label>Title <input name={'url_'+i+'_title'} maxlength="200" placeholder="Use batch default"></label></p><label>Project <select name={'url_'+i+'_project'}><option value="default">Use batch default</option><option value="">General</option>{#each data.projects as project}{#if !project.archived_at}<option value={project.id}>{project.name}</option>{/if}{/each}</select></label><p><label>Categories <select name={'url_'+i+'_category_mode'}><option value="default">Use batch default</option><option value="none">None</option><option value="custom">Use selections below</option></select></label></p>{#each data.categories as category}<label><input type="checkbox" name={'url_'+i+'_categories'} value={category.id}>{category.name}</label> {/each}</details>{/each}{/if}
<p><label><input type="checkbox" name="confirmDuplicate"> Save even if the image or URL already exists</label></p><button disabled={submitting || !!savedReference}>{submitting ? 'Saving…' : 'Save references'}</button></form>
