import { CalendarDays, Clock, Download, Eye, FileText, Layers, Presentation } from 'lucide-react';
import { availability } from '../../data/documents.js';
import { Reveal } from './Reveal.jsx';

/**
 * Card for a document or slide deck. Only available files get View and
 * Download actions; anything else shows its status with no link.
 */
export function FileCard({ item, kind = 'document', delay = 0 }) {
  const status = availability[item.status];
  const isAvailable = item.status === 'available' && Boolean(item.file);
  const KindIcon = kind === 'presentation' ? Presentation : FileText;
  const titleId = `file-${item.id}-title`;
  const downloadName = item.file?.split('/').pop();

  return (
    <Reveal
      as="li"
      delay={delay}
      className={`card flex flex-col p-6 ${isAvailable ? 'card-hover' : 'border-dashed'}`}
      aria-labelledby={titleId}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex h-11 w-11 items-center justify-center rounded-md ring-1 ring-inset ${
            isAvailable ? 'bg-brand/10 text-brand ring-brand/25' : 'bg-white/5 text-muted ring-line/20'
          }`}
        >
          <KindIcon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className={`badge ${status.className}`}>{status.label}</span>
      </div>

      {item.category && <p className="mt-4 text-[0.72rem] font-bold uppercase tracking-[0.14em] text-cyan">{item.category}</p>}
      <h3 id={titleId} className={`${item.category ? 'mt-1' : 'mt-4'} text-[1.08rem] font-bold leading-snug`}>
        {item.title}
      </h3>
      <p className="mt-2 flex-1 text-[0.87rem] leading-relaxed text-muted">{item.description}</p>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[0.78rem] text-muted">
        <li className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          {item.date ?? 'Date to be confirmed'}
        </li>
        {isAvailable && (
          <>
            <li className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              {item.slides ? `${item.slides} slides` : `${item.pages} ${item.pages === 1 ? 'page' : 'pages'}`}
            </li>
            <li>PDF · {item.size}</li>
          </>
        )}
      </ul>
      {item.note && <p className="mt-2 text-[0.76rem] italic text-muted">{item.note}</p>}

      <div className="mt-5 border-t border-line/10 pt-4">
        {isAvailable ? (
          <div className="flex flex-wrap gap-2">
            <a href={item.file} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
              <Eye className="h-4 w-4" aria-hidden="true" />
              View<span className="sr-only"> {item.title} (PDF, opens in a new tab)</span>
            </a>
            <a href={item.file} download={downloadName} className="btn btn-secondary btn-sm">
              <Download className="h-4 w-4" aria-hidden="true" />
              Download<span className="sr-only"> {item.title} (PDF, {item.size})</span>
            </a>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-[0.84rem] font-medium text-muted">
            <Clock className="h-4 w-4" aria-hidden="true" />
            {item.status === 'in-preparation' ? 'Will be published after submission' : 'Will be added when released'}
          </p>
        )}
      </div>
    </Reveal>
  );
}
