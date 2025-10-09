"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface NewThreadFormData {
  title: string;
  content: string;
}

export default function NewThreadPage() {
  const params = useParams();
  const router = useRouter();
  const categorySlug = params?.category as string;

  const [formData, setFormData] = useState<NewThreadFormData>({
    title: "",
    content: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.content.trim()) {
      setError("Title and content are required");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/forums/categories/${categorySlug}/threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
          body: JSON.stringify({
            title: formData.title,
            first_post_content: formData.content,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to create thread");
      }

      const newThread = await response.json();
      router.push(`/community/forums/thread/${newThread.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push(`/community/forums/${categorySlug}`);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/community/forums/${categorySlug}`}
          className="text-blue-600 hover:text-blue-800 flex items-center gap-2 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {categorySlug}
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Create New Thread</h1>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
          <p className="font-bold">Error</p>
          <p>{error}</p>
        </div>
      )}

      {/* Form */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Thread Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="title"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="Enter a descriptive title for your thread"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              maxLength={200}
            />
            <p className="text-sm text-gray-500 mt-1">
              {formData.title.length}/200 characters
            </p>
          </div>

          {/* Content */}
          <div>
            <label
              htmlFor="content"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Content <span className="text-red-500">*</span>
            </label>
            <textarea
              id="content"
              value={formData.content}
              onChange={(e) =>
                setFormData({ ...formData, content: e.target.value })
              }
              placeholder="Write your message here..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={12}
              required
            />
            <p className="text-sm text-gray-500 mt-1">
              Be respectful and follow community guidelines
            </p>
          </div>

          {/* Guidelines Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">
              Posting Guidelines
            </h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Be respectful and courteous to other members</li>
              <li>• Stay on topic and relevant to the category</li>
              <li>• No spam, advertising, or self-promotion</li>
              <li>• Use clear, descriptive titles</li>
              <li>• Search before posting to avoid duplicates</li>
            </ul>
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleCancel}
              disabled={submitting}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !formData.title.trim() || !formData.content.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Creating Thread..." : "Create Thread"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
