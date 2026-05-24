/**
 * Local timeline — recent file open/save events in the workspace session.
 */
import { basename } from '../../utils/pathUtils';

export interface TimelineEntry {
  id: string;
  path: string;
  label: string;
  time: number;
}

export class TimelineView {
  private listEl: HTMLElement;
  private entries: TimelineEntry[] = [];
  private onOpenFile: (path: string) => void;

  constructor(listEl: HTMLElement, onOpenFile: (path: string) => void) {
    this.listEl = listEl;
    this.onOpenFile = onOpenFile;
    this.render();
  }

  push(path: string, label: string): void {
    const entry: TimelineEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      path,
      label,
      time: Date.now(),
    };
    this.entries = [entry, ...this.entries.filter((e) => !(e.path === path && e.label === label))].slice(
      0,
      40,
    );
    this.render();
  }

  clear(): void {
    this.entries = [];
    this.render();
  }

  private render(): void {
    if (this.entries.length === 0) {
      this.listEl.innerHTML = '<p class="sidebar-section-empty">No recent activity</p>';
      return;
    }
    this.listEl.innerHTML = '';
    this.entries.forEach((entry) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'timeline-item';
      const time = new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      row.innerHTML = `
        <span class="timeline-label">${escapeHtml(entry.label)}</span>
        <span class="timeline-file">${escapeHtml(basename(entry.path))}</span>
        <span class="timeline-time">${time}</span>
      `;
      row.addEventListener('click', () => this.onOpenFile(entry.path));
      this.listEl.appendChild(row);
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
