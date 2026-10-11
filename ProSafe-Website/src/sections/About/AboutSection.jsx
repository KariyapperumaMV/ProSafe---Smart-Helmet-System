import { Building2, GraduationCap, IdCard, Mail, UserRound } from 'lucide-react';
import { contact, researcher, site, supervisors } from '../../data/site.js';
import { Section, SectionHeader } from '../../components/ui/Section.jsx';
import { Reveal } from '../../components/ui/Reveal.jsx';
import { BrandIcon } from '../../components/ui/BrandIcon.jsx';

function Avatar({ initials, photo, name, size = 'lg' }) {
  const sizes = { lg: 'h-28 w-28 text-[2rem]', md: 'h-14 w-14 text-[1.05rem]' };
  if (photo) {
    return <img src={photo} alt={`Photograph of ${name}`} className={`${sizes[size]} rounded-full object-cover ring-2 ring-brand/40`} />;
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-brand/40 bg-brand/10 font-extrabold text-brand ${sizes[size]}`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

const projectFacts = [
  { label: 'Project ID', value: site.projectId },
  { label: 'Module', value: site.module },
  { label: 'Year', value: site.academicYear },
  { label: 'Project type', value: site.projectType },
  { label: 'Research group', value: site.researchGroup },
  { label: 'Specialization', value: site.specialization },
];

export function AboutSection() {
  return (
    <Section id="about" labelledBy="about-title" tinted>
      <SectionHeader
        id="about-title"
        eyebrow="06 · About Us"
        title="About the research"
        lead="ProSafe is an individual final-year research project, carried out under academic supervision at SLIIT."
      />

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <Reveal as="article" className="card relative overflow-hidden p-6 sm:p-8" aria-labelledby="researcher-name">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand/10 blur-3xl" aria-hidden="true" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start">
            <Avatar initials={researcher.initials} photo={researcher.photo} name={researcher.name} />
            <div className="min-w-0">
              <span className="badge badge-safe">{researcher.role}</span>
              <h3 id="researcher-name" className="mt-3 text-[1.6rem] font-bold leading-tight">{researcher.name}</h3>
              <ul className="mt-4 space-y-2 text-[0.9rem] text-muted">
                <li className="flex items-center gap-2.5">
                  <IdCard className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                  Student ID <span className="font-semibold text-ink">{researcher.studentId}</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                  <span>{researcher.degree}, specializing in {researcher.specialization}</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                  <span>{researcher.department}, {researcher.institution}</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="relative mt-7 border-t border-line/10 pt-6">
            <h4 className="text-[0.76rem] font-bold uppercase tracking-[0.14em] text-muted">Research title</h4>
            <p className="mt-2 font-semibold text-ink">{site.researchTitle}</p>
            <h4 className="mt-6 text-[0.76rem] font-bold uppercase tracking-[0.14em] text-muted">Work carried out</h4>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {researcher.responsibilities.map((r) => (
                <li key={r} className="flex gap-2.5 text-[0.86rem] leading-relaxed text-muted">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                  {r}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mt-7 flex flex-wrap gap-2">
            {contact.email ? (
              <a href={`mailto:${contact.email}`} className="btn btn-secondary btn-sm">
                <Mail className="h-4 w-4" aria-hidden="true" /> {contact.email}
              </a>
            ) : (
              <a href="#contact" className="btn btn-secondary btn-sm">
                <Mail className="h-4 w-4" aria-hidden="true" /> Contact form
              </a>
            )}
            <a href={contact.githubProfile} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
              <BrandIcon name="siGithub" className="h-4 w-4" /> GitHub<span className="sr-only"> profile (opens in a new tab)</span>
            </a>
          </div>
        </Reveal>

        <div className="flex flex-col gap-6">
          <Reveal className="card p-6">
            <h3 className="text-[1.1rem] font-bold">Supervision</h3>
            <ul className="mt-5 space-y-4">
              {supervisors.map((s) => (
                <li key={s.name} className="card-raised flex items-center gap-4 p-4">
                  <Avatar initials={s.initials} name={s.name} size="md" />
                  <div className="min-w-0">
                    <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-cyan">{s.role}</p>
                    <p className="font-semibold text-ink">{s.name}</p>
                    <p className="text-[0.82rem] text-muted">{s.affiliation}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal className="card p-6">
            <h3 className="flex items-center gap-2 text-[1.1rem] font-bold">
              <UserRound className="h-5 w-5 text-brand" aria-hidden="true" /> Project details
            </h3>
            <dl className="mt-4 divide-y divide-line/10">
              {projectFacts.map((f) => (
                <div key={f.label} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5 text-[0.88rem]">
                  <dt className="text-muted">{f.label}</dt>
                  <dd className="font-semibold text-ink sm:text-right">{f.value}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
