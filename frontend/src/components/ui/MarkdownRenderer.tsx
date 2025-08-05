import React from 'react';
import ReactMarkdown from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = ''
}) => {
  return (
    <ReactMarkdown
      className={`markdown-content ${className}`}
      components={{
        // Custom styling for different markdown elements
        h1: ({children}) => <h1 className="text-xl font-bold mb-2 text-gray-900">{children}</h1>,
        h2: ({children}) => <h2 className="text-lg font-semibold mb-2 text-gray-800">{children}</h2>,
        h3: ({children}) => <h3 className="text-md font-medium mb-1 text-gray-700">{children}</h3>,
        
        // Styled paragraphs
        p: ({children}) => <p className="mb-2 leading-relaxed">{children}</p>,
        
        // Enhanced bullet points
        ul: ({children}) => <ul className="space-y-1 mb-3">{children}</ul>,
        li: ({children}) => (
          <li className="flex items-start">
            <span className="text-blue-500 mr-2 mt-0.5 text-sm">•</span>
            <span className="flex-1">{children}</span>
          </li>
        ),
        
        // Numbered lists
        ol: ({children}) => <ol className="space-y-1 mb-3 list-decimal list-inside">{children}</ol>,
        
        // Strong/bold text with emphasis
        strong: ({children}) => <strong className="font-semibold text-gray-900">{children}</strong>,
        
        // Code formatting for IDs and references
        code: ({children}) => (
          <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
            {children}
          </code>
        ),
        
        // Blockquotes for important notices
        blockquote: ({children}) => (
          <blockquote className="border-l-4 border-blue-400 bg-blue-50 pl-4 py-2 my-3 italic text-gray-700">
            {children}
          </blockquote>
        ),
        
        // Code blocks
        pre: ({children}) => (
          <pre className="bg-gray-100 rounded p-3 overflow-x-auto text-sm mb-3">
            {children}
          </pre>
        ),
        
        // Links (if any)
        a: ({children, href}) => (
          <a href={href} className="text-blue-600 hover:text-blue-800 underline">
            {children}
          </a>
        )
      }}
    >
      {content}
    </ReactMarkdown>
  );
};

export default MarkdownRenderer; 