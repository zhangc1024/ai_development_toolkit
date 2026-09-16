<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch, ref } from 'vue'
import { basicSetup } from 'codemirror'
import { EditorState, Compartment, Prec } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { json } from '@codemirror/lang-json'
import { sql, MySQL } from '@codemirror/lang-sql'
import { foldAll, unfoldAll } from '@codemirror/language'
import { openSearchPanel } from '@codemirror/search'

const props = withDefaults(defineProps<{ modelValue: string; readonly?: boolean; label: string; wrap?: boolean; hint?: string; language?: 'json' | 'text' | 'sql' }>(), { readonly: false, wrap: true, hint: '', language: 'json' })
const emit = defineEmits<{ 'update:modelValue': [value: string]; run: [] }>()
const host = ref<HTMLDivElement>()
const wrapConfig = new Compartment()
let view: EditorView | undefined
onMounted(() => {
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({ doc: props.modelValue, extensions: [
      basicSetup, props.language === 'text' ? EditorState.lineSeparator.of('\n') : [], props.language === 'json' ? json() : props.language === 'sql' ? sql({ dialect: MySQL }) : [], EditorState.readOnly.of(props.readonly),
      EditorView.contentAttributes.of({ 'aria-label': props.label, spellcheck: 'false' }),
      placeholder(props.hint),
      wrapConfig.of(props.wrap ? EditorView.lineWrapping : []),
      Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => { emit('run'); return true } }])),
      EditorView.updateListener.of(update => {
        if (update.docChanged && update.state.doc.toString() !== props.modelValue) emit('update:modelValue', update.state.doc.toString())
      }),
    ] }),
  })
})
watch(() => props.modelValue, value => {
  if (view && view.state.doc.toString() !== value) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
})
watch(() => props.wrap, value => view?.dispatch({ effects: wrapConfig.reconfigure(value ? EditorView.lineWrapping : []) }))
onBeforeUnmount(() => view?.destroy())
defineExpose({
  focusError(offset: number) { if (!view) return; view.dispatch({ selection: { anchor: Math.min(offset, view.state.doc.length) }, scrollIntoView: true }); view.focus() },
  search() { if (view) openSearchPanel(view) },
  fold() { if (view) foldAll(view) },
  unfold() { if (view) unfoldAll(view) },
})
</script>
<template><div ref="host" class="code-editor"></div></template>
