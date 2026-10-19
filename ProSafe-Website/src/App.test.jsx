import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';
import { legacyAnchors, navItems, resourceTabs } from './data/site.js';
import { allFiles } from './data/documents.js';

const renderApp = () => render(<App />);

describe('App', () => {
  it('renders the six main sections with a single h1', () => {
    const { container } = renderApp();
    for (const id of ['home', 'prosafe', 'methodology', 'results', 'resources', 'about', 'contact', 'helmet']) {
      expect(container.querySelector(`#${id}`), id).not.toBeNull();
    }
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });

  it('points every navigation item, in-page link and legacy anchor at a real target', () => {
    const { container } = renderApp();
    const exists = (id) => resourceTabs.includes(id) || container.querySelector(`[id="${id}"]`) !== null;
    const navIds = navItems.flatMap((item) => [item.id, ...(item.children ?? []).map((c) => c.id)]);
    for (const id of navIds) expect(exists(id), id).toBe(true);
    const linkIds = [...container.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href').slice(1)).filter(Boolean);
    for (const id of new Set(linkIds)) expect(exists(id), `#${id}`).toBe(true);
    for (const target of Object.values(legacyAnchors)) expect(exists(target), target).toBe(true);
  });

  it('switches resource categories and only offers downloads for available files', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('tab', { name: /Documents/ }));
    const panel = screen.getByRole('tabpanel');
    for (const file of allFiles.filter((f) => f.status === 'available' && f.file.startsWith('/documents'))) {
      expect(panel.querySelector(`a[download][href="${file.file}"]`), file.id).not.toBeNull();
    }
    await user.click(screen.getByRole('tab', { name: /Presentations/ }));
    const final = within(screen.getByRole('tabpanel')).getByRole('heading', { name: 'Final Presentation' }).closest('li');
    expect(within(final).queryByRole('link')).toBeNull();
  });

  it('changes milestone details from the dropdown', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.selectOptions(screen.getByLabelText('Select an assessment'), 'dissertation');
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByRole('heading', { name: 'Final Dissertation' })).toBeInTheDocument();
    expect(within(panel).getByText('19%')).toBeInTheDocument();
  });

  it('shows helmet component details without WebGL (accessible fallback)', async () => {
    const user = userEvent.setup();
    renderApp();
    const list = screen.getByRole('list', { name: 'Helmet components' });
    expect(within(list).getAllByRole('button')).toHaveLength(9);
    await user.click(within(list).getByRole('button', { name: /Skin Temperature Sensor/ }));
    expect(screen.getByText(/does not measure core body temperature/)).toBeInTheDocument();
    expect(screen.getByText(/WebGL is not available/)).toBeInTheDocument();
  });

  it('steps through the ML pipeline', async () => {
    const user = userEvent.setup();
    renderApp();
    const stages = screen.getByRole('list', { name: 'ML pipeline stages' });
    await user.click(within(stages).getByRole('button', { name: /Data-quality gate/ }));
    expect(screen.getByText(/Reported as UNCERTAIN when/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next stage' }));
    expect(within(stages).getByRole('button', { name: /ML classification/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('validates the contact form before sending', async () => {
    const user = userEvent.setup();
    renderApp();
    const form = document.querySelector('#contact form');
    await user.click(within(form).getByRole('button', { name: /Send message/ }));
    expect(within(form).getByText('Please enter your name.')).toBeInTheDocument();
    expect(within(form).getByLabelText(/^Name/)).toHaveFocus();
  });
});
