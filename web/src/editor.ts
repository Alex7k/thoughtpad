import { basicSetup, EditorView } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState, RangeSetBuilder } from '@codemirror/state'
import { Decoration, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { vim } from '@replit/codemirror-vim'
import { tags } from '@lezer/highlight'
import { yCollab } from 'y-codemirror.next'
import type { WebsocketProvider } from 'y-websocket'
import type * as Y from 'yjs'

export const vimCompartment = new Compartment()

type EditorOptions = {
  yText: Y.Text
  provider: WebsocketProvider
  vimMode: boolean
  onContentChange: (content: string) => void
}

export function createEditorState({ yText, provider, vimMode, onContentChange }: EditorOptions) {
  return EditorState.create({
    extensions: [
      vimCompartment.of(vimMode ? vim() : []),
      basicSetup,
      markdown(),
      syntaxHighlighting(linkHighlight),
      thoughtpadTheme,
      inlineImages,
      headingLineStyle,
      yCollab(yText, provider.awareness),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onContentChange(update.state.doc.toString())
        }
      })
    ]
  })
}

export function setEditorVimMode(view: EditorView, vimMode: boolean) {
  view.dispatch({
    effects: vimCompartment.reconfigure(vimMode ? vim() : [])
  })
}

class ImageWidget extends WidgetType {
  constructor(private readonly src: string) {
    super()
  }

  toDOM() {
    const image = document.createElement('img')
    image.src = this.src
    image.alt = ''
    image.className = 'cm-inline-image'
    image.loading = 'lazy'
    return image
  }

  ignoreEvent() {
    return false
  }
}

const inlineImages = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildImageDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildImageDecorations(update.view)
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations
  }
)

const headingLineStyle = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildHeadingLineDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildHeadingLineDecorations(update.view)
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations
  }
)

function buildHeadingLineDecorations(view: EditorView) {
  const builder = new RangeSetBuilder<Decoration>()

  for (const { from, to } of view.visibleRanges) {
    const startLine = view.state.doc.lineAt(from)
    const endLine = view.state.doc.lineAt(to)

    for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
      const line = view.state.doc.line(lineNumber)
      const match = /^(#{1,6})\s/.exec(line.text)
      if (!match) continue

      const level = Math.min(match[1].length, 3)
      builder.add(line.from, line.from, Decoration.line({ class: `cm-heading-line cm-heading-line-${level}` }))
    }
  }

  return builder.finish()
}

function buildImageDecorations(view: EditorView) {
  const builder = new RangeSetBuilder<Decoration>()
  const imagePattern = /!\[[^\]]*]\(([^)\s]+)\)/g

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)
    let match: RegExpExecArray | null

    while ((match = imagePattern.exec(text)) !== null) {
      const src = match[1]
      const position = from + match.index + match[0].length
      builder.add(position, position, Decoration.widget({ widget: new ImageWidget(src), side: 1 }))
    }
  }

  return builder.finish()
}

const thoughtpadTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      color: '#e5e5e5',
      backgroundColor: '#111111',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: '15px'
    },
    '.cm-scroller': {
      fontFamily: 'inherit',
      lineHeight: '1.55'
    },
    '.cm-content': {
      minHeight: '100%',
      padding: '16px 14px',
      caretColor: '#e5e5e5'
    },
    '.cm-gutters': {
      backgroundColor: '#111111',
      color: '#666666',
      borderRight: '1px solid #2a2a2a'
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(255, 255, 255, 0.04)'
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#181818'
    },
    '.cm-cursor': {
      borderLeftColor: '#e5e5e5'
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: '#2d4f67'
    },
    '.cm-heading-line-1': {
      color: '#ffffff',
      fontSize: '1.35em',
      fontWeight: '900',
      lineHeight: '1.85'
    },
    '.cm-heading-line-2': {
      color: '#ffffff',
      fontSize: '1.22em',
      fontWeight: '900',
      lineHeight: '1.7'
    },
    '.cm-heading-line-3': {
      color: '#ffffff',
      fontSize: '1.1em',
      fontWeight: '900',
      lineHeight: '1.55'
    },
    '&.cm-focused': {
      outline: 'none'
    }
  },
  { dark: true }
)

const linkHighlight = HighlightStyle.define([
  {
    tag: [tags.link, tags.labelName],
    color: '#9be66d'
  },
  {
    tag: [tags.url, tags.processingInstruction],
    color: '#55a7ff'
  }
])
