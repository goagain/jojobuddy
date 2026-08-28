"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { useI18n } from "@/components/LocaleProvider";
import type { SourceRecord } from "@/lib/entities";
import { formatHealthHint } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import type { PublicModel } from "@/lib/llm-types";
import { renderMasterResumeMarkdown, serializeMasterResumeJson } from "@/lib/render-master-resume";
import { emptyExperience, emptyResume, uid } from "@/lib/resume-factory";
import type { MasterResume } from "@/lib/schema";
import { waitForWorkJob } from "@/lib/wait-work";

function fileStem(value: string) {
  const cleaned = value.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 48) || "profile";
}

function downloadText(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function splitList(value: string) {
  return value
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinList(items: string[] | undefined, locale: Locale) {
  return (items ?? []).join(locale === "zh" ? "，" : ", ");
}

export function ProfileEditor({ profileId }: { profileId?: string }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [name, setName] = useState(() => t("defaultProfileName"));
  const [resume, setResume] = useState<MasterResume>(emptyResume);
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [models, setModels] = useState<PublicModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState(() => t("reading"));
  const [ok, setOk] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((payload) => {
        setOk(Boolean(payload.ok));
        setHint(formatHealthHint(t, payload));
        const listed = (payload.models ?? []) as PublicModel[];
        setModels(listed);
        setModelId(listed.find((item) => item.kind !== "mock")?.id ?? listed[0]?.id ?? "");
      })
      .catch(() => setHint(t("healthFail")));

    if (!profileId) return;
    fetch(`/api/profiles/${profileId}`)
      .then((response) => response.json())
      .then((payload) => {
        if (payload.profile) {
          setName(payload.profile.name);
          setResume(payload.profile.resume);
          setSources(payload.profile.sources ?? []);
          const latestUpload = (payload.profile.sources ?? []).find(
            (item: SourceRecord) => item.kind === "upload" && item.filename,
          );
          if (latestUpload?.filename) setUploadedName(latestUpload.filename);
        } else {
          setError(payload.error ?? t("profileNotFound"));
        }
      })
      .catch(() => setError(t("readProfilesFail")));
  }, [profileId, t]);

  async function parse(form: FormData) {
    setBusy("parse");
    setProgress(t("extracting"));
    setError(null);
    if (modelId) form.set("modelId", modelId);
    try {
      const response = await fetch("/api/profiles/parse", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("parseFail"));
      if (!payload.jobId) throw new Error(payload.error ?? t("enqueueFail"));
      const result = await waitForWorkJob<{
        resume: MasterResume;
        source: SourceRecord;
      }>(payload.jobId, (step, status) => {
        setProgress(step?.step ?? status ?? t("queueing"));
      });
      setResume(result.resume);
      setSources((prev) => [result.source, ...prev]);
      if (result.source?.filename) setUploadedName(result.source.filename);
      if (!name || name === t("defaultProfileName")) {
        const person = result.resume?.identity?.name;
        if (person) setName(t("profileOfPerson", { name: person }));
      }
      setPaste("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("parseFail"));
    } finally {
      setBusy(null);
      setProgress("");
    }
  }

  async function save() {
    setBusy("save");
    setError(null);
    try {
      const response = await fetch(profileId ? `/api/profiles/${profileId}` : "/api/profiles", {
        method: profileId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, resume, sources }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t("saveFail"));
      router.push("/profiles");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saveFail"));
    } finally {
      setBusy(null);
    }
  }

  const identity = resume.identity;
  const exportStem = fileStem(name || identity.name || t("defaultProfileName"));

  function downloadJson() {
    downloadText(
      serializeMasterResumeJson(resume),
      `${exportStem}.json`,
      "application/json;charset=utf-8",
    );
  }

  function downloadMarkdown() {
    downloadText(
      renderMasterResumeMarkdown(resume, locale),
      `${exportStem}.md`,
      "text/markdown;charset=utf-8",
    );
  }

  return (
    <div className="min-h-screen px-4 py-5 md:px-8">
      <AppHeader status={{ ok, hint }} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="display text-[11px] tracking-[0.3em] kicker">PROFILE</p>
          <h1 className="text-3xl font-black">{profileId ? t("editProfile") : t("newProfile")}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" disabled={Boolean(busy)} onClick={downloadJson}>
            {t("downloadJson")}
          </button>
          <button type="button" className="btn" disabled={Boolean(busy)} onClick={downloadMarkdown}>
            {t("downloadMd")}
          </button>
          <button type="button" className="btn btn-violet" disabled={Boolean(busy)} onClick={save}>
            {busy === "save" ? t("saving") : t("saveProfile")}
          </button>
        </div>
      </div>
      {error ? <p className="mb-3 text-sm font-bold text-rose-700">{error}</p> : null}

      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_220px]">
        <label className="field-label">
          {t("profileName")}
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field-label">
          {t("parseModel")}
          <select value={modelId} onChange={(event) => setModelId(event.target.value)}>
            {models.length === 0 ? <option value="">{t("needModelsImport")}</option> : null}
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.providerName} / {model.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="panel panel-gold mb-4">
        <p className="display text-[11px] tracking-[0.3em] kicker-gold">IMPORT</p>
        <h2 className="mb-3 text-xl font-black">{t("importAuto")}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="field-label">
            {t("uploadFileTypes")}
            <input
              type="file"
              accept=".docx,.pdf,.md,.markdown,.txt,.text"
              disabled={Boolean(busy)}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setUploadedName(file.name);
                const form = new FormData();
                form.set("file", file);
                void parse(form);
              }}
            />
            {uploadedName ? (
              <span className="source-block mt-2 text-sm">
                {t("selectedFile")} <strong>{uploadedName}</strong>
                {busy === "parse"
                  ? ` · ${progress || t("parsingColumns")}`
                  : t("sourceSavedNote")}
              </span>
            ) : null}
          </label>
          <div className="space-y-2">
            <label className="field-label">
              {t("orPasteText")}
              <textarea
                rows={4}
                value={paste}
                onChange={(event) => setPaste(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn"
              disabled={Boolean(busy) || paste.trim().length < 20}
              onClick={() => {
                const form = new FormData();
                form.set("text", paste);
                void parse(form);
              }}
            >
              {busy === "parse" ? progress || t("parsing") : t("parseThisText")}
            </button>
          </div>
        </div>
        {sources.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-black tracking-widest kicker-gold">{t("persistedSources")}</p>
            {sources.map((source) => (
              <details key={source.id} className="source-block" open>
                <summary className="cursor-pointer font-bold">
                  {source.kind === "upload" ? t("sourceUpload") : t("sourcePasteKind")}
                  {source.filename ? ` · ${source.filename}` : ""} ·{" "}
                  {source.createdAt.slice(0, 16).replace("T", " ")}
                </summary>
                <pre>{source.text}</pre>
              </details>
            ))}
          </div>
        ) : null}
      </section>

      <section className="panel mb-4 space-y-3">
        <h2 className="text-xl font-black">{t("identity")}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="field-label">
            {t("personName")}
            <input
              value={identity.name}
              onChange={(event) =>
                setResume((prev) => ({
                  ...prev,
                  identity: { ...prev.identity, name: event.target.value },
                }))
              }
            />
          </label>
          <label className="field-label">
            {t("headline")}
            <input
              value={identity.headline ?? ""}
              onChange={(event) =>
                setResume((prev) => ({
                  ...prev,
                  identity: { ...prev.identity, headline: event.target.value },
                }))
              }
            />
          </label>
          <label className="field-label">
            {t("email")}
            <input
              value={identity.email}
              onChange={(event) =>
                setResume((prev) => ({
                  ...prev,
                  identity: { ...prev.identity, email: event.target.value },
                }))
              }
            />
          </label>
          <label className="field-label">
            {t("phone")}
            <input
              value={identity.phone ?? ""}
              onChange={(event) =>
                setResume((prev) => ({
                  ...prev,
                  identity: { ...prev.identity, phone: event.target.value },
                }))
              }
            />
          </label>
          <label className="field-label">
            {t("location")}
            <input
              value={identity.location ?? ""}
              onChange={(event) =>
                setResume((prev) => ({
                  ...prev,
                  identity: { ...prev.identity, location: event.target.value },
                }))
              }
            />
          </label>
          <label className="field-label">
            {t("linksFormat")}
            <textarea
              rows={2}
              value={(identity.links ?? []).map((item) => `${item.label}|${item.url}`).join("\n")}
              onChange={(event) =>
                setResume((prev) => ({
                  ...prev,
                  identity: {
                    ...prev.identity,
                    links: event.target.value
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .map((line) => {
                        const [label, ...rest] = line.split("|");
                        return { label: label.trim(), url: rest.join("|").trim() };
                      }),
                  },
                }))
              }
            />
          </label>
        </div>
        <label className="field-label">
          {t("summary")}
          <textarea
            rows={3}
            value={identity.summary ?? ""}
            onChange={(event) =>
              setResume((prev) => ({
                ...prev,
                identity: { ...prev.identity, summary: event.target.value },
              }))
            }
          />
        </label>
      </section>

      <section className="panel mb-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-black">{t("workExperience")}</h2>
          <button
            type="button"
            className="btn"
            onClick={() =>
              setResume((prev) => ({
                ...prev,
                experiences: [emptyExperience(), ...prev.experiences],
              }))
            }
          >
            {t("addExperience")}
          </button>
        </div>
        <div className="space-y-4">
          {resume.experiences.map((experience, index) => (
            <article key={experience.id} className="nested p-3">
              <div className="mb-2 flex justify-between">
                <p className="text-xs font-black tracking-widest kicker">EXPERIENCE {index + 1}</p>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() =>
                    setResume((prev) => ({
                      ...prev,
                      experiences: prev.experiences.filter((item) => item.id !== experience.id),
                    }))
                  }
                >
                  {t("delete")}
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="field-label">
                  {t("company")}
                  <input
                    value={experience.company}
                    onChange={(event) =>
                      setResume((prev) => ({
                        ...prev,
                        experiences: prev.experiences.map((item) =>
                          item.id === experience.id ? { ...item, company: event.target.value } : item,
                        ),
                      }))
                    }
                  />
                </label>
                <label className="field-label">
                  {t("title")}
                  <input
                    value={experience.title}
                    onChange={(event) =>
                      setResume((prev) => ({
                        ...prev,
                        experiences: prev.experiences.map((item) =>
                          item.id === experience.id ? { ...item, title: event.target.value } : item,
                        ),
                      }))
                    }
                  />
                </label>
                <label className="field-label">
                  {t("location")}
                  <input
                    value={experience.location ?? ""}
                    onChange={(event) =>
                      setResume((prev) => ({
                        ...prev,
                        experiences: prev.experiences.map((item) =>
                          item.id === experience.id ? { ...item, location: event.target.value } : item,
                        ),
                      }))
                    }
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="field-label">
                    {t("startDate")}
                    <input
                      value={experience.startDate}
                      onChange={(event) =>
                        setResume((prev) => ({
                          ...prev,
                          experiences: prev.experiences.map((item) =>
                            item.id === experience.id ? { ...item, startDate: event.target.value } : item,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className="field-label">
                    {t("endDate")}
                    <input
                      value={experience.endDate}
                      onChange={(event) =>
                        setResume((prev) => ({
                          ...prev,
                          experiences: prev.experiences.map((item) =>
                            item.id === experience.id ? { ...item, endDate: event.target.value } : item,
                          ),
                        }))
                      }
                    />
                  </label>
                </div>
              </div>
              <label className="field-label mt-3">
                {t("businessContext")}
                <textarea
                  rows={2}
                  value={experience.businessContext}
                  onChange={(event) =>
                    setResume((prev) => ({
                      ...prev,
                      experiences: prev.experiences.map((item) =>
                        item.id === experience.id
                          ? { ...item, businessContext: event.target.value }
                          : item,
                      ),
                    }))
                  }
                />
              </label>
              <label className="field-label mt-3">
                {t("techStackComma")}
                <input
                  value={joinList(experience.techStack, locale)}
                  onChange={(event) =>
                    setResume((prev) => ({
                      ...prev,
                      experiences: prev.experiences.map((item) =>
                        item.id === experience.id
                          ? { ...item, techStack: splitList(event.target.value) }
                          : item,
                      ),
                    }))
                  }
                />
              </label>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black">{t("bulletsLabel")}</p>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      setResume((prev) => ({
                        ...prev,
                        experiences: prev.experiences.map((item) =>
                          item.id === experience.id
                            ? { ...item, bullets: [...item.bullets, { id: uid(), raw: "" }] }
                            : item,
                        ),
                      }))
                    }
                  >
                    {t("addBullet")}
                  </button>
                </div>
                {experience.bullets.map((bullet) => (
                  <div key={bullet.id} className="flex gap-2">
                    <textarea
                      rows={2}
                      value={bullet.raw}
                      onChange={(event) =>
                        setResume((prev) => ({
                          ...prev,
                          experiences: prev.experiences.map((item) =>
                            item.id === experience.id
                              ? {
                                  ...item,
                                  bullets: item.bullets.map((row) =>
                                    row.id === bullet.id ? { ...row, raw: event.target.value } : row,
                                  ),
                                }
                              : item,
                          ),
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() =>
                        setResume((prev) => ({
                          ...prev,
                          experiences: prev.experiences.map((item) =>
                            item.id === experience.id
                              ? {
                                  ...item,
                                  bullets: item.bullets.filter((row) => row.id !== bullet.id),
                                }
                              : item,
                          ),
                        }))
                      }
                    >
                      {t("delete")}
                    </button>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel mb-4">
        <h2 className="mb-3 text-xl font-black">{t("education")}</h2>
        <div className="space-y-3">
          {resume.education.map((edu, index) => (
            <div key={`${edu.school}-${index}`} className="nested grid gap-3 p-3 md:grid-cols-2">
              <label className="field-label">
                {t("school")}
                <input
                  value={edu.school}
                  onChange={(event) =>
                    setResume((prev) => ({
                      ...prev,
                      education: prev.education.map((item, idx) =>
                        idx === index ? { ...item, school: event.target.value } : item,
                      ),
                    }))
                  }
                />
              </label>
              <label className="field-label">
                {t("degree")}
                <input
                  value={edu.degree}
                  onChange={(event) =>
                    setResume((prev) => ({
                      ...prev,
                      education: prev.education.map((item, idx) =>
                        idx === index ? { ...item, degree: event.target.value } : item,
                      ),
                    }))
                  }
                />
              </label>
              <label className="field-label">
                {t("field")}
                <input
                  value={edu.field ?? ""}
                  onChange={(event) =>
                    setResume((prev) => ({
                      ...prev,
                      education: prev.education.map((item, idx) =>
                        idx === index ? { ...item, field: event.target.value } : item,
                      ),
                    }))
                  }
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="field-label">
                  {t("startDate")}
                  <input
                    value={edu.startDate ?? ""}
                    onChange={(event) =>
                      setResume((prev) => ({
                        ...prev,
                        education: prev.education.map((item, idx) =>
                          idx === index ? { ...item, startDate: event.target.value } : item,
                        ),
                      }))
                    }
                  />
                </label>
                <label className="field-label">
                  {t("endDate")}
                  <input
                    value={edu.endDate ?? ""}
                    onChange={(event) =>
                      setResume((prev) => ({
                        ...prev,
                        education: prev.education.map((item, idx) =>
                          idx === index ? { ...item, endDate: event.target.value } : item,
                        ),
                      }))
                    }
                  />
                </label>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() =>
              setResume((prev) => ({
                ...prev,
                education: [
                  ...prev.education,
                  { school: "", degree: "", field: "", startDate: "", endDate: "", highlights: [] },
                ],
              }))
            }
          >
            {t("addEducation")}
          </button>
        </div>
      </section>

      <section className="panel mb-4 space-y-3">
        <h2 className="text-xl font-black">{t("skills")}</h2>
        {resume.skills.map((skill, index) => (
          <div key={`${skill.category}-${index}`} className="grid gap-3 md:grid-cols-[200px_1fr_auto]">
            <input
              placeholder={t("category")}
              value={skill.category}
              onChange={(event) =>
                setResume((prev) => ({
                  ...prev,
                  skills: prev.skills.map((item, idx) =>
                    idx === index ? { ...item, category: event.target.value } : item,
                  ),
                }))
              }
            />
            <input
              placeholder={t("itemsComma")}
              value={joinList(skill.items, locale)}
              onChange={(event) =>
                setResume((prev) => ({
                  ...prev,
                  skills: prev.skills.map((item, idx) =>
                    idx === index ? { ...item, items: splitList(event.target.value) } : item,
                  ),
                }))
              }
            />
            <button
              type="button"
              className="btn-danger"
              onClick={() =>
                setResume((prev) => ({
                  ...prev,
                  skills: prev.skills.filter((_, idx) => idx !== index),
                }))
              }
            >
              {t("delete")}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn"
          onClick={() =>
            setResume((prev) => ({
              ...prev,
              skills: [...prev.skills, { category: "", items: [] }],
            }))
          }
        >
          {t("addSkillCategory")}
        </button>
        <label className="field-label">
          {t("softSkills")}
          <input
            value={joinList(resume.softSkills, locale)}
            onChange={(event) =>
              setResume((prev) => ({ ...prev, softSkills: splitList(event.target.value) }))
            }
          />
        </label>
      </section>

      <section className="panel mb-8">
        <h2 className="mb-3 text-xl font-black">{t("projectsOptional")}</h2>
        {resume.projects.map((project) => (
          <div key={project.id} className="nested mb-3 p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="field-label">
                {t("projectName")}
                <input
                  value={project.name}
                  onChange={(event) =>
                    setResume((prev) => ({
                      ...prev,
                      projects: prev.projects.map((item) =>
                        item.id === project.id ? { ...item, name: event.target.value } : item,
                      ),
                    }))
                  }
                />
              </label>
              <label className="field-label">
                {t("projectRole")}
                <input
                  value={project.role ?? ""}
                  onChange={(event) =>
                    setResume((prev) => ({
                      ...prev,
                      projects: prev.projects.map((item) =>
                        item.id === project.id ? { ...item, role: event.target.value } : item,
                      ),
                    }))
                  }
                />
              </label>
            </div>
            <label className="field-label mt-3">
              {t("summary")}
              <textarea
                rows={2}
                value={project.summary}
                onChange={(event) =>
                  setResume((prev) => ({
                    ...prev,
                    projects: prev.projects.map((item) =>
                      item.id === project.id ? { ...item, summary: event.target.value } : item,
                    ),
                  }))
                }
              />
            </label>
          </div>
        ))}
        <button
          type="button"
          className="btn"
          onClick={() =>
            setResume((prev) => ({
              ...prev,
              projects: [
                ...prev.projects,
                { id: uid(), name: "", summary: "", techStack: [], bullets: [] },
              ],
            }))
          }
        >
          {t("addProject")}
        </button>
      </section>
    </div>
  );
}
