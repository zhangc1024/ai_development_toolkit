<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch, ref } from 'vue'
import { basicSetup } from 'codemirror'
import { EditorState, Compartment, Prec, StateEffect, StateField } from '@codemirror/state'
import { EditorView, keymap, placeholder, Decoration, type DecorationSet } from '@codemirror/view'
import { json } from '@codemirror/lang-json'
import { sql, MySQL } from '@codemirror/lang-sql'
import { foldAll, unfoldAll } from '@codemirror/language'
import { openSearchPanel } from '@codemirror/search'

const props = withDefaults(defineProps<{ modelValue: string; readonly?: boolean; label: string; wrap?: boolean; hint?: string; language?: 'json' | 'text' | 'sql'; marks?: { from: number; to: number; title: string; active?: boolean }[] }>(), { readonly: false, wrap: true, hint: '', language: 'json' })
const emit = defineEmits<{ 'update:modelValue': [value: string]; run: [] }>()
const host = ref<HTMLDivElement>()
const wrapConfig = new Compartment()
const setMarks = StateEffect.define<DecorationSet>()
const marksField = StateField.define<DecorationSet>({
 create: () => Decoration.none,
 update(value, transaction) {
  if (transaction.docChanged) value = Decoration.none
  for (const effect of transaction.effects) if (effect.is(setMarks)) value = effect.value
  return value
 },
 provide: field => EditorView.decorations.from(field),
})
function updateMarks() {
 if (!view) return
 const decorations = (props.marks ?? []).filter(m => m.from >= 0 && m.to > m.from && m.to <= view!.state.doc.length)
  .map(m => Decoration.mark({class: 'json-difference' + (m.active ? ' active-difference' : ''), attributes: {title: m.title}}).range(m.from, m.to))
 view.dispatch({effects: setMarks.of(Decoration.set(decorations, true))})
}
let view: EditorView | undefined
onMounted(() => {
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({ doc: props.modelValue, extensions: [
      basicSetup, marksField, props.language === 'text' ? EditorState.lineSeparator.of('\n') : [], props.language === 'json' ? json() : props.language === 'sql' ? sql({ dialect: MySQL }) : [], EditorState.readOnly.of(props.readonly),
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
watch(() => props.marks, updateMarks, { deep: true })
watch(() => props.modelValue, value => {
  if (view && view.state.doc.toString() !== value) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
})
watch(() => props.wrap, value => view?.dispatch({ effects: wrapConfig.reconfigure(value ? EditorView.lineWrapping : []) }))
onBeforeUnmount(() => view?.destroy())
defineExpose({
  reveal(from: number, to: number) {
   if (!view) return
   unfoldAll(view)
   view.dispatch({selection:{anchor:Math.min(from,view.state.doc.length),head:Math.min(to,view.state.doc.length)},effects:EditorView.scrollIntoView(Math.min(from,view.state.doc.length),{y:'center'})})
  },
  focusError(offset: number) { if (!view) return; view.dispatch({ selection: { anchor: Math.min(offset, view.state.doc.length) }, scrollIntoView: true }); view.focus() },
  search() { if (view) openSearchPanel(view) },
  fold() { if (view) foldAll(view) },
  unfold() { if (view) unfoldAll(view) },
})
</script>
<template><div ref="host" class="code-editor"></div></template>

<style>
.cm-editor .json-difference{background:#fee2e2;color:#991b1b!important;text-decoration:underline;text-decoration-color:#dc2626;text-underline-offset:3px}.cm-editor .json-difference *{color:#991b1b!important}.cm-editor .active-difference{background:#fecaca;outline:1px solid #dc2626}
</style>
