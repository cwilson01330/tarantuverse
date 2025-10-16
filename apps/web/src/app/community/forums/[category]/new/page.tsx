"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface NewThreadFormData {
  title: string;
  content: string;
}

interface Category {
  id: number;
  name: string;
  slug: string;
}

export default function NewThreadPage() {
  const params = useParams();
  const router = useRouter();
  const categorySlug = params?.category as string;

  const [category, setCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState<NewThreadFormData>({
    title: "",
    content: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingCategory, setLoadingCategory] = useState(true);

  // Fetch category info to get category ID
  useEffect(() => {
    const fetchCategory = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/forums/categories/${categorySlug}`
        );
        if (!response.ok) {
          throw new Error("Category not found");
        }
        const data = await response.json();
        setCategory(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load category");
      } finally {
        setLoadingCategory(false);
      }
    };

    if (categorySlug) {
      fetchCategory();
    }
  }, [categorySlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.content.trim()) {
      setError("Title and content are required");
      return;
    }

    if (!category) {
      setError("Category not loaded");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/forums/threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
          body: JSON.stringify({
            category_id: category.id,
            title: formData.title,
            content: formData.content,
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

  if (loadingCategory) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center text-gray-400">Loading category...</div>
      </div>
    );
  }

  if (!category) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center text-red-400">Category not found</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/community/forums/${categorySlug}`}
          className="text-electric-blue-400 hover:text-electric-blue-300 flex items-center gap-2 mb-4"
        >
          <span className="flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to {category.name}
          </span>
        </Link>
        <h1 className="text-3xl font-bold text-gray-100">Create New Thread</h1>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-900/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg mb-4">
          <p className="font-bold">Error</p>
          <p>{error}</p>
        </div>
      )}

      {/* Form */}
      <div className="bg-dark-50 border border-electric-blue-500/20 rounded-lg shadow-md p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Thread Title <span className="text-neon-pink-400">*</span>
            </label>
            <input
              type="text"
              id="title"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="Enter a descriptive title for your thread"
              className="w-full px-4 py-3 bg-dark border border-electric-blue-500/20 text-gray-100 placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-electric-blue-500 focus:border-transparent"
              required
              maxLength={200}
            />
            <p className="text-sm text-gray-400 mt-1">
              {formData.title.length}/200 characters
            </p>
          </div>

          {/* Content */}
          <div>
            <label
              htmlFor="content"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Content <span className="text-neon-pink-400">*</span>
            </label>
            <textarea
              id="content"
              value={formData.content}
              onChange={(e) =>
                setFormData({ ...formData, content: e.target.value })
              }
              placeholder="Write your message here..."
              className="w-full px-4 py-3 bg-dark border border-electric-blue-500/20 text-gray-100 placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-electric-blue-500 focus:border-transparent resize-none"
              rows={12}
              required
            />
            <p className="text-sm text-gray-400 mt-1">
              Be respectful and follow community guidelines
            </p>
          </div>

          {/* Guidelines Box */}
          <div className="bg-electric-blue-500/10 border border-electric-blue-500/30 rounded-lg p-4">
            <h3 className="font-semibold text-electric-blue-300 mb-2">
              Posting Guidelines
            </h3>
            <ul className="text-sm text-gray-300 space-y-1">
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
              className="px-6 py-2 bg-dark-50 border border-electric-blue-500/20 text-gray-300 rounded-lg hover:border-electric-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !formData.title.trim() || !formData.content.trim()}
              className="px-6 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-lg hover:shadow-electric-blue-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Creating Thread..." : "Create Thread"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
