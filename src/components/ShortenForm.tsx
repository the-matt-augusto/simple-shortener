"use client";

import { useState } from "react";

function normalizeUrl(raw: string): string {
    const trimmed = raw.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }

export default function ShortenForm() {
  const [url, setUrl] = useState("");
  const [shortUrl, setShortUrl] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setShortUrl("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/shorten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizeUrl(url) }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Algo deu errado. Tente de novo.");
        return;
      }

      setShortUrl(data.shortUrl);
    } catch {
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="text"
        inputMode="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Cole aqui a URL longa"
        required
        className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={isLoading}
        className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
      >
        {isLoading ? "Encurtando..." : "Encurtar"}
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {shortUrl && (
        <a
          href={shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-center text-blue-400 hover:underline"
        >
          {shortUrl}
        </a>
      )}
    </form>
  );
}