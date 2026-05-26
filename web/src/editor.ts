import { basicSetup, EditorView } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { Compartment, EditorState, RangeSetBuilder } from '@codemirror/state'
import { Decoration, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { vim } from '@replit/codemirror-vim'
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
      thoughtpadTheme,
      inlineImages,
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
      backgroundColor: '#181818'
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
    '&.cm-focused': {
      outline: 'none'
    }
  },
  { dark: true }
)
