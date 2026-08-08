import { useState, type FormEvent } from 'react'

import { ApiError, ingestLogs, type IngestResponse } from '../api'
import { Icon } from '../components/Icon'

type IngestProps = {
  onIngested: () => void
  onOpenExplore: () => void
}

function createSampleBatch() {
  return JSON.stringify({
    logs: [
      {
        timestamp: new Date().toISOString(),
        level: 'info',
        service: 'checkout',
        message: 'Order confirmed',
        attributes: {
          request_id: 'req_7f2a',
          region: 'eu-west',
          duration_ms: 184,
        },
      },
    ],
  }, null, 2)
}

export function Ingest({ onIngested, onOpenExplore }: IngestProps) {
  const [payload, setPayload] = useState(() => createSampleBatch())
  const [result, setResult] = useState<IngestResponse | null>(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setResult(null)

    let parsed: unknown
    try {
      parsed = JSON.parse(payload)
    } catch {
      setError('The batch is not valid JSON. Check punctuation and try again.')
      return
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('logs' in parsed) ||
      !Array.isArray(parsed.logs)
    ) {
      setError('The top-level object must contain a “logs” array.')
      return
    }

    setSending(true)
    try {
      const response = await ingestLogs(parsed)
      setResult(response)
      if (response.accepted > 0) onIngested()
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
      } else {
        setError('The batch could not be ingested.')
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="view ingest-view">
      <section className="view-intro compact-intro">
        <div>
          <span className="eyebrow">POST /logs</span>
          <h1>Batch ingest</h1>
          <p>Send structured logs directly and see per-entry acceptance feedback.</p>
        </div>
        <button type="button" className="secondary-button" onClick={onOpenExplore}>
          <Icon name="search" /> Explore stored logs
        </button>
      </section>

      <div className="ingest-layout">
        <form className="surface composer" onSubmit={submit}>
          <header className="section-heading composer-heading">
            <div>
              <span className="eyebrow">Request body</span>
              <h2>JSON batch</h2>
            </div>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setPayload(createSampleBatch())
                setError('')
                setResult(null)
              }}
            >
              Reset sample
            </button>
          </header>

          <div className={`editor-shell${error ? ' has-error' : ''}`}>
            <div className="editor-gutter" aria-hidden="true">
              {payload.split('\n').map((_, index) => <span key={index}>{index + 1}</span>)}
            </div>
            <label>
              <span className="sr-only">Log batch JSON</span>
              <textarea
                value={payload}
                onChange={(event) => {
                  setPayload(event.target.value)
                  setError('')
                  setResult(null)
                }}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </label>
          </div>

          {error && <p className="editor-error" role="alert">{error}</p>}

          <footer className="composer-footer">
            <p>Valid entries are committed even when siblings are rejected.</p>
            <button type="submit" className="primary-button send-button" disabled={sending}>
              <Icon name={sending ? 'refresh' : 'send'} className={sending ? 'spin' : ''} />
              {sending ? 'Sending batch…' : 'Send batch'}
            </button>
          </footer>
        </form>

        <aside className="ingest-side">
          {result ? (
            <section className="surface ingest-result materialize" aria-live="polite">
              <span className={`result-mark${result.accepted === 0 ? ' rejected' : ''}`}>
                <Icon name={result.accepted > 0 ? 'check' : 'close'} />
              </span>
              <span className="eyebrow">Response received</span>
              <h2>{result.accepted > 0 ? 'Batch committed' : 'Batch rejected'}</h2>
              <div className="result-numbers">
                <div><strong>{result.accepted}</strong><span>Accepted</span></div>
                <div><strong>{result.rejected.length}</strong><span>Rejected</span></div>
              </div>
              {result.rejected.length > 0 && (
                <div className="rejection-list">
                  <strong>Rejected entries</strong>
                  <ul>
                    {result.rejected.map((rejection) => (
                      <li key={rejection.index}>
                        <span>#{rejection.index}</span>
                        <p>{rejection.reason}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.accepted > 0 && (
                <button type="button" className="secondary-button full" onClick={onOpenExplore}>
                  View latest events <Icon name="chevron-right" />
                </button>
              )}
            </section>
          ) : (
            <section className="surface request-guide">
              <span className="guide-icon"><Icon name="code" /></span>
              <span className="eyebrow">Contract guide</span>
              <h2>What makes a valid log?</h2>
              <dl>
                <div><dt>timestamp</dt><dd>ISO 8601 · ≤ 5m future</dd></div>
                <div><dt>level</dt><dd>debug · info · warn · error</dd></div>
                <div><dt>service</dt><dd>Non-empty string</dd></div>
                <div><dt>message</dt><dd>Non-empty string</dd></div>
                <div><dt>attributes</dt><dd>Flat primitive values</dd></div>
              </dl>
              <p><Icon name="spark" /> Entries are validated independently.</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
