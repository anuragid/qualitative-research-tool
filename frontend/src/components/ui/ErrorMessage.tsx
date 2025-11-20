import React from "react";
import { AlertCircle, RefreshCw, HelpCircle, Copy, CheckCircle } from "lucide-react";
import { Button } from "./Button";
import { cn } from "../../lib/utils";

interface ErrorSolution {
  text: string;
  action?: () => void;
  actionLabel?: string;
}

interface ErrorMessageProps {
  title?: string;
  message: string;
  details?: string;
  solutions?: ErrorSolution[];
  onRetry?: () => void;
  variant?: "inline" | "card" | "banner";
  className?: string;
}

export function ErrorMessage({
  title = "Something went wrong",
  message,
  details,
  solutions,
  onRetry,
  variant = "card",
  className,
}: ErrorMessageProps) {
  const [copiedDetails, setCopiedDetails] = React.useState(false);

  const handleCopyDetails = () => {
    if (details) {
      navigator.clipboard.writeText(details);
      setCopiedDetails(true);
      setTimeout(() => setCopiedDetails(false), 2000);
    }
  };

  const baseClasses = {
    inline: "flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200",
    card: "rounded-lg border border-red-200 bg-red-50 p-4",
    banner: "w-full bg-red-50 border-y border-red-200 p-4",
  };

  return (
    <div className={cn(baseClasses[variant], className)}>
      <div className="flex gap-3">
        <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2">
          <div>
            <h3 className="font-semibold text-red-900">{title}</h3>
            <p className="text-sm text-red-700 mt-1">{message}</p>
          </div>

          {details && (
            <details className="group">
              <summary className="cursor-pointer text-xs text-red-600 hover:text-red-700 flex items-center gap-1">
                <HelpCircle className="h-3 w-3" />
                Show technical details
              </summary>
              <div className="mt-2 p-2 bg-white rounded border border-red-100">
                <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                  {details}
                </pre>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCopyDetails}
                  className="mt-2 text-xs"
                >
                  {copiedDetails ? (
                    <>
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" />
                      Copy details
                    </>
                  )}
                </Button>
              </div>
            </details>
          )}

          {solutions && solutions.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-medium text-red-900">Try these solutions:</p>
              <ul className="space-y-1">
                {solutions.map((solution, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-red-600 text-sm">•</span>
                    <div className="flex-1">
                      <span className="text-sm text-red-700">{solution.text}</span>
                      {solution.action && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={solution.action}
                          className="ml-2 text-xs h-auto py-0.5 px-2"
                        >
                          {solution.actionLabel || "Try this"}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {onRetry && (
            <Button
              size="sm"
              variant="outline"
              onClick={onRetry}
              className="mt-3 border-red-300 text-red-700 hover:bg-red-100"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper function to get user-friendly error messages
export function getUserFriendlyError(error: any): {
  title: string;
  message: string;
  solutions?: ErrorSolution[];
} {
  // Network errors
  if (error?.code === "ERR_NETWORK" || error?.message?.includes("network")) {
    return {
      title: "Connection Problem",
      message: "Unable to connect to the server. Please check your internet connection.",
      solutions: [
        { text: "Check if you're connected to the internet" },
        { text: "Try refreshing the page", action: () => window.location.reload(), actionLabel: "Refresh" },
        { text: "Check if the server is running" },
      ],
    };
  }

  // Timeout errors
  if (error?.code === "ECONNABORTED" || error?.message?.includes("timeout")) {
    return {
      title: "Request Timeout",
      message: "The operation took too long to complete.",
      solutions: [
        { text: "Try again with a smaller file or dataset" },
        { text: "Check your internet speed" },
        { text: "Contact support if the problem persists" },
      ],
    };
  }

  // File size errors
  if (error?.response?.status === 413) {
    return {
      title: "File Too Large",
      message: "The file exceeds the maximum allowed size of 5GB.",
      solutions: [
        { text: "Compress or reduce the file size" },
        { text: "Split large videos into smaller segments" },
        { text: "Use a video compression tool" },
      ],
    };
  }

  // Invalid file type
  if (error?.response?.status === 415) {
    return {
      title: "Invalid File Type",
      message: "This file type is not supported.",
      solutions: [
        { text: "Supported formats: MP4, AVI, MOV, WMV, FLV" },
        { text: "Convert your file to a supported format" },
        { text: "Use a video conversion tool" },
      ],
    };
  }

  // Server errors
  if (error?.response?.status >= 500) {
    return {
      title: "Server Error",
      message: "The server encountered an error while processing your request.",
      solutions: [
        { text: "Wait a few moments and try again" },
        { text: "Check the server status" },
        { text: "Contact support if the error persists" },
      ],
    };
  }

  // Authentication errors
  if (error?.response?.status === 401 || error?.response?.status === 403) {
    return {
      title: "Access Denied",
      message: "You don't have permission to perform this action.",
      solutions: [
        { text: "Make sure you're logged in" },
        { text: "Check your account permissions" },
        { text: "Contact your administrator" },
      ],
    };
  }

  // Default error
  return {
    title: "Error",
    message: error?.message || "An unexpected error occurred.",
    solutions: [
      { text: "Try refreshing the page", action: () => window.location.reload(), actionLabel: "Refresh" },
      { text: "Check your internet connection" },
      { text: "Contact support if the problem continues" },
    ],
  };
}