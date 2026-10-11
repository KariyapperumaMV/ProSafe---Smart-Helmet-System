import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';
import { navItems } from './data/site.js';
import { allFiles } from './data/documents.js';

const renderApp = () => render(<App />);

describe('App', () => {
  it('renders every required section with a single h1', () => {
    const { container } = renderApp();
    for (const id of ['home', 'domain', 'milestones', 'documents', 'presentations', 'about', 'contact']) {
      expect(container.querySelector(`#${id}`), id).not.toBeNull();
    }
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });

  it('points every in-page link at an element that exists', () => {
    const { container } = renderApp();
    const ids = [...container.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href').slice(1)).filter(Boolean);
    for (const id of new Set(ids)) expect(container.querySelector(`[id="${id}"]`), `#${id}`).not.toBeNull();
    const navIds = navItems.flatMap((item) => [item.id, ...(item.children ?? []).map((c) => c.id)]);
    for (const id of navIds) expect(container.querySelector(`#${id}`), id).not.toBeNull();
  });

  it('offers view and download links only for available files', () => {
    renderApp();
    const available = allFiles.filter((f) => f.status === 'available');
    for (const file of available) {
      const links = document.querySelectorAll(`#documents a[href="${file.file}"], #presentations a[href="${file.file}"]`);
      expect(links.length, file.id).toBe(2);
      expect([...links].some((a) => a.hasAttribute('download'))).toBe(true);
    }
    const final = screen.getByRole('heading', { name: 'Final Presentation' }).closest('li');
    expect(within(final).queryByRole('link')).toBeNull();
    expect(within(final).getByText('Not yet available')).toBeInTheDocument();
  });

  it('switches milestone details from the dropdown', async () => {
    const user = userEvent.setup();
    renderApp();
    const select = screen.getByLabelText('Select an assessment');
    await user.selectOptions(select, 'viva');
    const milestones = document.getElementById('milestones');
    expect(within(milestones).getByRole('heading', { level: 3, name: 'Viva' })).toBeInTheDocument();
    expect(within(milestones).getAllByText('To be confirmed').length).toBeGreaterThan(0);
    await user.selectOptions(select, 'pp1');
    expect(within(milestones).getByRole('heading', { level: 3, name: 'Progress Presentation 1' })).toBeInTheDocument();
    expect(within(milestones).getAllByText('12 May 2026').length).toBeGreaterThan(0);
  });

  it('switches methodology tabs, including with the keyboard', async () => {
    const user = userEvent.setup();
    renderApp();
    const tab = screen.getByRole('tab', { name: /Smart Helmet/ });
    await user.click(tab);
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Smart helmet hardware and firmware');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Data & Features/ })).toHaveAttribute('aria-selected', 'true');
    expect(window.location.hash).toBe('#methodology-data');
  });

  it('validates the contact form before sending', async () => {
    const user = userEvent.setup();
    renderApp();
    const form = document.querySelector('#contact form');
    await user.click(within(form).getByRole('button', { name: /Send message/ }));
    expect(within(form).getByText('Please enter your name.')).toBeInTheDocument();
    expect(within(form).getByLabelText(/^Name/)).toHaveAttribute('aria-invalid', 'true');
    expect(within(form).getByLabelText(/^Name/)).toHaveFocus();
  });
});
