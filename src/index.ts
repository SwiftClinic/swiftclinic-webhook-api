// Load environment variables first
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import morgan from 'morgan';
import { body, param } from 'express-validator';
import { createServer } from 'http';

import { SecureDatabase } from './shared/database';
import { EncryptionService } from './shared/security/encryption';
import { ClinicConfig, WebhookPayload, APIResponse, BookingSystemType } from './shared/types';
import { LLMBrain, ChatRequest, LLMResponse, FunctionCall } from './core/llm-brain';
import { BookingAdapterFactory } from './booking-adapters/adapter-factory';
import { BaseBookingAdapter } from './booking-adapters/base-booking-adapter';
import { FallbackManager } from './core/fallback-manager';

// Simple middleware for webhook API
const validationMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const errors: any[] = [];
  
  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: errors
      },
      timestamp: new Date()
    });
    return;
  }
  
  next();
};

class WebhookAPIServer {
  private app: express.Application;
  private server: any;
  private database!: SecureDatabase; // Will be initialized in initialize()
  private encryptionService!: EncryptionService; // Will be initialized in initialize()
  private llmBrain!: LLMBrain; // Will be initialized in initialize()
  private fallbackManager!: FallbackManager; // Will be initialized in initialize()
  private clinicAdapterCache: Map<string, { config: ClinicConfig; adapter: BaseBookingAdapter; cachedAt: number }> = new Map();
  private clinicConfigCache: Map<string, { config: ClinicConfig; cachedAt: number }> = new Map();
  private isReady: boolean = false;

  constructor() {
    this.app = express();
    // Database, encryption service, and LLM brain will be initialized in initialize() method
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupSecurity(): void {
    // Security headers
    this.app.use(helmet({
      contentSecurityPolicy: false // Disable CSP for API
    }));

    // CORS - more permissive for webhook API
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow all origins including null (file:// protocol)
        callback(null, true);
      },
      credentials: false,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Session-ID']
    }));

    // Rate limiting - less strict for webhook API
    const limiter = rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 30, // 30 requests per minute per IP
      message: {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later'
        },
        timestamp: new Date()
      },
      standardHeaders: true,
      legacyHeaders: false
    });
    this.app.use(limiter);
  }

  private setupMiddleware(): void {
    // Manual CORS headers to fix null origin issue
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Session-ID');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });

    // Compression
    this.app.use(compression());

    // Logging
    if (process.env.NODE_ENV !== 'test') {
      this.app.use(morgan('combined'));
    }

    // Body parsing
    this.app.use(express.json({ limit: '1mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    // Request ID and timestamp
    this.app.use((req, res, next) => {
      req.id = Math.random().toString(36).substr(2, 9);
      res.setHeader('X-Request-ID', req.id);
      res.setHeader('X-Timestamp', new Date().toISOString());
      next();
    });
  }

  private setupRoutes(): void {
    // Lightweight health endpoints that never block on external services
    this.app.get('/', (req, res) => res.status(200).json({ status: 'ok' }));
    this.app.get('/healthz', (req, res) => res.status(200).json({ status: 'ok' }));
    this.app.get('/readyz', (req, res) => {
      if (this.isReady) {
        return res.status(200).json({ ready: true });
      }
      return res.status(503).json({ ready: false });
    });
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date() });
    });

    // System health endpoint with fallback status
    this.app.get('/health/detailed', async (req, res) => {
      try {
        const systemHealth = await BookingAdapterFactory.getSystemHealth();
        const fallbackConfig = this.fallbackManager.getFallbackConfig();
        
        res.json({
          status: systemHealth.overall,
          components: {
            booking: systemHealth.booking,
            llm: Boolean(process.env.OPENAI_API_KEY),
            database: true, // If we reach here, database is working
            fallback: systemHealth.fallbackActive
          },
          fallback: {
            active: systemHealth.fallbackActive,
            mockBookingEnabled: fallbackConfig.enableMockFallback,
            offlineLLMEnabled: false
          },
          timestamp: new Date()
        });
      } catch (error) {
        res.status(500).json({
          status: 'critical',
          error: 'Health check failed',
          timestamp: new Date()
        });
      }
    });

    // Complete testing and approval UI
    this.app.get('/test-ui', (req, res) => {
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LLM Session Tester & Conversation Approval</title>
    <!-- Add marked.js for markdown rendering -->
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #f5f7fa;
            color: #2d3748;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            text-align: center;
            margin-bottom: 40px;
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        
        .header h1 {
            color: #1a202c;
            margin-bottom: 10px;
            font-size: 2.5rem;
        }
        
        .header p {
            color: #718096;
            font-size: 1.1rem;
            margin-bottom: 10px;
        }
        
        .rating-info {
            background: #e6fffa;
            border: 1px solid #81e6d9;
            border-radius: 8px;
            padding: 15px;
            margin-top: 15px;
        }
        
        .rating-info h3 {
            color: #234e52;
            margin-bottom: 8px;
            font-size: 1.1rem;
        }
        
        .rating-info p {
            color: #285e61;
            font-size: 0.95rem;
        }
        
        .grid {
            display: grid;
            grid-template-columns: 1fr 1.2fr;
            gap: 30px;
            margin-bottom: 40px;
        }
        
        @media (max-width: 1024px) {
            .grid {
                grid-template-columns: 1fr;
            }
        }
        
        .panel {
            background: white;
            border-radius: 12px;
            padding: 30px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            border: 1px solid #e2e8f0;
        }
        
        .panel h2 {
            color: #2d3748;
            margin-bottom: 20px;
            font-size: 1.5rem;
            border-bottom: 2px solid #4299e1;
            padding-bottom: 10px;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #4a5568;
        }
        
        input, textarea {
            width: 100%;
            padding: 12px 16px;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.2s, box-shadow 0.2s;
        }
        
        input:focus, textarea:focus {
            outline: none;
            border-color: #4299e1;
            box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.1);
        }
        
        textarea {
            resize: vertical;
            min-height: 120px;
        }
        
        .btn {
            background: linear-gradient(135deg, #4299e1 0%, #3182ce 100%);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 600;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        
        .btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 8px 15px rgba(66, 153, 225, 0.3);
        }
        
        .btn-success {
            background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
        }
        
        .btn-warning {
            background: linear-gradient(135deg, #ed8936 0%, #dd6b20 100%);
        }
        
        .btn-danger {
            background: linear-gradient(135deg, #f56565 0%, #e53e3e 100%);
        }
        
        .btn-small {
            padding: 8px 16px;
            font-size: 14px;
        }
        
        .response-area {
            margin-top: 20px;
            padding: 20px;
            background: #f7fafc;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
        }
        
        .response-content {
            background: white;
            padding: 15px;
            border-radius: 6px;
            border: 1px solid #e2e8f0;
            font-family: 'Monaco', monospace;
            white-space: pre-wrap;
            max-height: 400px;
            overflow-y: auto;
        }
        
        .session-item {
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            margin-bottom: 20px;
            overflow: hidden;
            transition: all 0.2s;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        
        .session-item:hover {
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
            transform: translateY(-2px);
        }
        
        .session-header {
            background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%);
            padding: 20px;
            border-bottom: 1px solid #e2e8f0;
        }
        
        .session-id {
            font-weight: 700;
            color: #2d3748;
            font-size: 1.1rem;
            margin-bottom: 8px;
        }
        
        .session-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        
        .session-stats {
            display: flex;
            gap: 20px;
            font-size: 14px;
            color: #718096;
        }
        
        .session-actions {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
        }
        
        .conversation-preview {
            padding: 20px;
            max-height: 300px;
            overflow-y: auto;
            background: #fdfdfd;
        }
        
        .message {
            margin-bottom: 15px;
            padding: 12px 16px;
            border-radius: 12px;
            position: relative;
        }
        
        .message.user {
            background: linear-gradient(135deg, #e6f3ff 0%, #cce7ff 100%);
            border-left: 4px solid #4299e1;
            margin-left: 20px;
        }
        
        .message.assistant {
            background: linear-gradient(135deg, #f0fff4 0%, #dcf4e3 100%);
            border-left: 4px solid #48bb78;
            margin-right: 20px;
        }
        
        .message-role {
            font-weight: 700;
            margin-bottom: 8px;
            text-transform: uppercase;
            font-size: 11px;
            letter-spacing: 1px;
            opacity: 0.8;
        }
        
        .message.user .message-role {
            color: #3182ce;
        }
        
        .message.assistant .message-role {
            color: #38a169;
        }
        
        .message-content {
            color: #2d3748;
            line-height: 1.5;
        }
        
        /* Markdown Styling */
        .markdown-content strong {
            font-weight: 600;
            color: #1a202c;
        }
        
        .markdown-content ul {
            margin: 8px 0;
            padding-left: 0;
        }
        
        .markdown-content li {
            display: flex;
            align-items: flex-start;
            margin: 4px 0;
            list-style: none;
        }
        
        .markdown-content li:before {
            content: "•";
            color: #4299e1;
            font-weight: bold;
            margin-right: 8px;
            margin-top: 1px;
        }
        
        .markdown-content ol {
            margin: 8px 0;
            padding-left: 20px;
        }
        
        .markdown-content ol li:before {
            content: none;
        }
        
        .markdown-content code {
            background: #f7fafc;
            color: #2d3748;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Monaco', monospace;
            font-size: 0.9em;
            border: 1px solid #e2e8f0;
        }
        
        .markdown-content blockquote {
            border-left: 4px solid #4299e1;
            background: #ebf8ff;
            margin: 12px 0;
            padding: 12px 16px;
            border-radius: 0 4px 4px 0;
            font-style: italic;
            color: #2a69ac;
        }
        
        .markdown-content h1, .markdown-content h2, .markdown-content h3 {
            margin: 12px 0 8px 0;
            font-weight: 600;
        }
        
        .markdown-content h1 { font-size: 1.2em; color: #1a202c; }
        .markdown-content h2 { font-size: 1.1em; color: #2d3748; }
        .markdown-content h3 { font-size: 1.05em; color: #4a5568; }
        
        .markdown-content p {
            margin: 6px 0;
        }
        
        .stat-card {
            background: white;
            padding: 25px;
            border-radius: 12px;
            text-align: center;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
            border: 1px solid #e2e8f0;
            margin-bottom: 25px;
        }
        
        .stat-number {
            font-size: 2.5rem;
            font-weight: 900;
            color: #4299e1;
            margin-bottom: 5px;
        }
        
        .stat-label {
            color: #718096;
            font-size: 14px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .alert {
            padding: 16px 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-weight: 500;
            border: 1px solid;
        }
        
        .alert-success {
            background: #f0fff4;
            color: #22543d;
            border-color: #9ae6b4;
        }
        
        .alert-error {
            background: #fed7d7;
            color: #742a2a;
            border-color: #feb2b2;
        }
        
        .rating-explanation {
            background: #fef5e7;
            border: 1px solid #f6e05e;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 20px;
        }
        
        .rating-explanation h4 {
            color: #744210;
            margin-bottom: 8px;
            font-size: 1rem;
        }
        
        .rating-levels {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 10px;
            margin-top: 10px;
        }
        
        .rating-level {
            padding: 8px 12px;
            border-radius: 6px;
            text-align: center;
            font-size: 13px;
            font-weight: 600;
        }
        
        .rating-excellent {
            background: #f0fff4;
            color: #22543d;
            border: 1px solid #9ae6b4;
        }
        
        .rating-good {
            background: #fef5e7;
            color: #744210;
            border: 1px solid #f6e05e;
        }
        
        .rating-poor {
            background: #fed7d7;
            color: #742a2a;
            border: 1px solid #feb2b2;
        }
        
        .expanded {
            max-height: none !important;
        }
        
        .toggle-btn {
            background: #edf2f7;
            color: #4a5568;
            border: 1px solid #cbd5e0;
            margin-top: 10px;
        }
        
        .toggle-btn:hover {
            background: #e2e8f0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 LLM Session Tester & Conversation Approval</h1>
            <p>Test complete conversation sessions and approve them for positive-only learning</p>
            
            <div class="rating-info">
                <h3>🎯 Session-Level Rating Approach</h3>
                <p>You rate entire conversation sessions (not individual messages). Each approved session becomes training data to teach the LLM complete interaction patterns.</p>
            </div>
        </div>

        <div class="grid">
            <!-- Left Panel: Session Testing -->
            <div class="panel">
                <h2>🧪 Test Conversation Session</h2>
                
                <div class="form-group">
                    <label for="webhookId">Webhook ID</label>
                    <input type="text" id="webhookId" value="webhook_300612e45c22b8b0de9b2deb91e084c9e9864988ba70ffcdaadf7bfd5a699b5f" placeholder="Enter webhook ID">
                </div>
                
                <div class="form-group">
                    <label for="sessionId">Session ID (optional)</label>
                    <input type="text" id="sessionId" placeholder="Leave empty to generate new session">
                    <small style="color: #718096; font-size: 12px;">💡 Use same session ID to continue a conversation</small>
                </div>
                
                <div class="form-group">
                    <label for="message">Test Message</label>
                    <textarea id="message" placeholder="Enter your test message here...">Can I have a standard appointment for Thursday at 9am please</textarea>
                </div>
                
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="userConsent" checked> User Consent
                    </label>
                </div>
                
                <button class="btn" onclick="sendTestMessage()">
                    <span id="sendIcon">📤</span>
                    <span id="sendText">Send Test Message</span>
                </button>
                
                <div id="responseArea" class="response-area" style="display: none;">
                    <h3>Response:</h3>
                    <div id="responseContent" class="response-content"></div>
                </div>
            </div>

            <!-- Right Panel: Session Approval -->
            <div class="panel">
                <h2>✅ Session Approval for Learning</h2>
                
                <div class="stat-card">
                    <div id="pendingCount" class="stat-number">-</div>
                    <div class="stat-label">Sessions Pending Review</div>
                </div>
                
                <div class="rating-explanation">
                    <h4>🎯 Session Rating Guidelines</h4>
                    <div class="rating-levels">
                        <div class="rating-level rating-excellent">⭐ EXCELLENT<br><small>Perfect conversation flow</small></div>
                        <div class="rating-level rating-good">👍 GOOD<br><small>Solid interaction</small></div>
                        <div class="rating-level rating-poor">❌ REJECT<br><small>Remove from memory</small></div>
                    </div>
                </div>
                
                <button class="btn" onclick="loadPendingSessions()">
                    <span>🔄</span>
                    Refresh Sessions
                </button>
                
                <div id="sessionsContainer" style="margin-top: 25px;">
                    <!-- Sessions will be loaded here -->
                </div>
            </div>
        </div>
    </div>

    <script>
        const API_BASE = window.location.origin;
        
        document.addEventListener('DOMContentLoaded', function() {
            loadPendingSessions();
        });

        async function sendTestMessage() {
            const sendIcon = document.getElementById('sendIcon');
            const sendText = document.getElementById('sendText');
            const responseArea = document.getElementById('responseArea');
            const responseContent = document.getElementById('responseContent');
            
            const webhookId = document.getElementById('webhookId').value.trim();
            const sessionId = document.getElementById('sessionId').value.trim() || undefined;
            const message = document.getElementById('message').value.trim();
            const userConsent = document.getElementById('userConsent').checked;
            
            if (!webhookId || !message) {
                alert('Please fill in webhook ID and message');
                return;
            }
            
            sendIcon.textContent = '⏳';
            sendText.textContent = 'Sending...';
            responseArea.style.display = 'none';
            
            try {
                const response = await fetch(\`\${API_BASE}/webhook/\${webhookId}\`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message,
                        sessionId,
                        userConsent
                    })
                });
                
                const data = await response.json();
                
                responseContent.textContent = JSON.stringify(data, null, 2);
                responseArea.style.display = 'block';
                
                if (data.success && data.data && data.data.sessionId) {
                    document.getElementById('sessionId').value = data.data.sessionId;
                }
                
                setTimeout(loadPendingSessions, 1000);
                
            } catch (error) {
                responseContent.textContent = \`Error: \${error.message}\`;
                responseArea.style.display = 'block';
            } finally {
                sendIcon.textContent = '📤';
                sendText.textContent = 'Send Test Message';
            }
        }

        async function loadPendingSessions() {
            const container = document.getElementById('sessionsContainer');
            const pendingCount = document.getElementById('pendingCount');
            
            try {
                const response = await fetch(\`\${API_BASE}/admin/conversations/pending\`);
                const data = await response.json();
                
                if (data.success) {
                    const sessions = data.data.pendingConversations;
                    pendingCount.textContent = sessions.length;
                    
                    if (sessions.length === 0) {
                        container.innerHTML = '<p style="text-align: center; color: #718096; padding: 40px; font-style: italic;">No conversation sessions pending review</p>';
                        return;
                    }
                    
                    container.innerHTML = sessions.map(session => createSessionHTML(session)).join('');
                } else {
                    container.innerHTML = \`<div class="alert alert-error">Error loading sessions: \${data.error}</div>\`;
                }
            } catch (error) {
                container.innerHTML = \`<div class="alert alert-error">Network Error: \${error.message}</div>\`;
            }
        }

        async function createSessionHTML(session) {
            const { sessionId, metadata, messageCount } = session;
            const timeAgo = new Date(metadata.lastActivity).toLocaleString();
            
            // Load conversation content
            try {
                const response = await fetch(\`\${API_BASE}/admin/conversations/\${sessionId}\`);
                const data = await response.json();
                
                let conversationHTML = '';
                if (data.success) {
                    const { conversation } = data.data;
                    conversationHTML = conversation.map(msg => {
                        let content = msg.content;
                        let contentClass = 'message-content';
                        
                        // Render markdown for assistant messages, escape HTML for user messages
                        if (msg.role === 'assistant' && typeof marked !== 'undefined') {
                            marked.setOptions({
                                breaks: true,
                                sanitize: false,
                                smartLists: true,
                                smartypants: false
                            });
                            content = marked.parse(msg.content);
                            contentClass += ' markdown-content';
                        } else {
                            // Escape HTML for user messages to prevent XSS
                            content = msg.content.replace(/&/g, '&amp;')
                                                .replace(/</g, '&lt;')
                                                .replace(/>/g, '&gt;')
                                                .replace(/"/g, '&quot;')
                                                .replace(/'/g, '&#039;');
                        }
                        
                        return \`
                            <div class="message \${msg.role}">
                                <div class="message-role">\${msg.role}</div>
                                <div class="\${contentClass}">\${content}</div>
                            </div>
                        \`;
                    }).join('');
                }
                
                return \`
                    <div class="session-item" id="session-\${sessionId}">
                        <div class="session-header">
                            <div class="session-id">Session: \${sessionId.substring(0, 25)}...</div>
                            <div class="session-meta">
                                <div class="session-stats">
                                    <span>📝 \${messageCount} messages</span>
                                    <span>🕒 \${timeAgo}</span>
                                </div>
                            </div>
                            <div class="session-actions">
                                <button class="btn btn-success btn-small" onclick="approveSession('\${sessionId}', 'excellent')">
                                    ⭐ Excellent Session
                                </button>
                                <button class="btn btn-warning btn-small" onclick="approveSession('\${sessionId}', 'good')">
                                    👍 Good Session
                                </button>
                                <button class="btn btn-danger btn-small" onclick="rejectSession('\${sessionId}')">
                                    ❌ Reject Session
                                </button>
                                <button class="btn btn-small toggle-btn" onclick="toggleSessionView('\${sessionId}')">
                                    👁️ Review Conversation
                                </button>
                            </div>
                        </div>
                        <div class="conversation-preview" id="preview-\${sessionId}" style="display: none;">
                            \${conversationHTML}
                        </div>
                    </div>
                \`;
            } catch (error) {
                return \`
                    <div class="session-item">
                        <div class="alert alert-error">Error loading session \${sessionId}</div>
                    </div>
                \`;
            }
        }

        function toggleSessionView(sessionId) {
            const preview = document.getElementById(\`preview-\${sessionId}\`);
            const btn = event.target;
            
            if (preview.style.display === 'none') {
                preview.style.display = 'block';
                btn.textContent = '🔼 Hide Conversation';
            } else {
                preview.style.display = 'none';
                btn.textContent = '👁️ Review Conversation';
            }
        }

        async function approveSession(sessionId, qualityRating) {
            try {
                const response = await fetch(\`\${API_BASE}/admin/conversations/\${sessionId}/approve\`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ qualityRating })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    const sessionElement = document.getElementById(\`session-\${sessionId}\`);
                    sessionElement.innerHTML = \`
                        <div class="alert alert-success">
                            ✅ Session approved as "\${qualityRating.toUpperCase()}" and stored for learning!<br>
                            <small>The entire conversation will now teach the LLM this interaction pattern.</small>
                        </div>
                    \`;
                    
                    setTimeout(loadPendingSessions, 2500);
                } else {
                    alert(\`Error approving session: \${data.error}\`);
                }
            } catch (error) {
                alert(\`Error: \${error.message}\`);
            }
        }

        async function rejectSession(sessionId) {
            if (!confirm('Are you sure you want to reject this entire conversation session? It will be permanently removed from memory.')) {
                return;
            }
            
            try {
                const response = await fetch(\`\${API_BASE}/admin/conversations/\${sessionId}/reject\`, {
                    method: 'POST'
                });
                
                const data = await response.json();
                
                if (data.success) {
                    const sessionElement = document.getElementById(\`session-\${sessionId}\`);
                    sessionElement.innerHTML = \`
                        <div class="alert alert-error">
                            ❌ Session rejected and permanently removed from memory<br>
                            <small>This conversation will not be used for learning.</small>
                        </div>
                    \`;
                    
                    setTimeout(loadPendingSessions, 2500);
                } else {
                    alert(\`Error rejecting session: \${data.error}\`);
                }
            } catch (error) {
                alert(\`Error: \${error.message}\`);
            }
        }
    </script>
</body>
</html>`;
      res.send(html);
    });

    // Serve static testing UI (alternative route)
    this.app.use('/static', express.static(path.join(__dirname, '../static')));
    this.app.get('/tester', (req, res) => {
      res.sendFile(path.join(__dirname, '../static/tester.html'));
    });

    // Main webhook endpoint
    this.app.post('/webhook/:webhookId', this.handleWebhookMessage.bind(this));

    // Register clinic configuration (production: persists encrypted Cliniko creds)
    // Require admin bearer token for registration
    this.app.post('/register-clinic', async (req, res) => {
      try {
        const auth = req.header('authorization') || '';
        const expected = process.env.ADMIN_BEARER_TOKEN;
        if (!expected || !auth.startsWith('Bearer ') || auth.replace('Bearer ', '') !== expected) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
      } catch (e) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
      try {
        const { uniqueWebhookId, clinicId, clinicName, apiConfiguration } = req.body || {};
        if (!uniqueWebhookId || !apiConfiguration?.clinikApiKey || !apiConfiguration?.shard) {
          return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // Upsert by UUID webhook id
        // Encrypt credentials before storage
        const encrypted = this.encryptionService.encrypt(JSON.stringify({
          apiKey: apiConfiguration.clinikApiKey,
          shard: apiConfiguration.shard,
          businessId: apiConfiguration.businessId || ''
        }));

        const stored = await (this.database as any).upsertClinicByWebhookId({
          webhookId: uniqueWebhookId,
          clinicName: clinicName || 'Clinic',
          apiCredentials: encrypted,
          timezone: apiConfiguration.timezone || 'UTC',
          services: [],
          businessHours: {},
          contactInfo: {},
          bookingSystem: 'cliniko',
          gdprSettings: { dataRetentionDays: 90, allowDataProcessing: true, cookieConsent: true },
          isActive: true
        });

        // Bust caches
        this.clinicConfigCache.delete(uniqueWebhookId);
        this.clinicAdapterCache.delete(uniqueWebhookId);

        return res.json({ success: true, message: 'Clinic configuration registered successfully', data: { webhookId: uniqueWebhookId } });
      } catch (err: any) {
        console.error('register-clinic error:', err);
        return res.status(500).json({ success: false, error: 'Failed to register clinic' });
      }
    });

    // Admin Cliniko detection (secured)
    this.app.post('/admin/cliniko/detect', async (req, res) => {
      try {
        const auth = req.header('authorization') || '';
        const expected = process.env.ADMIN_BEARER_TOKEN;
        if (!expected || !auth.startsWith('Bearer ') || auth.replace('Bearer ', '') !== expected) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const { clinikApiKey, shard } = req.body || {};
        if (!clinikApiKey) {
          return res.status(400).json({ success: false, error: 'Missing Cliniko API key' });
        }

        const shardsToTry = shard ? [shard] : ['uk2', 'us1', 'au1', 'ca1'];
        const axios = (await import('axios')).default;

        for (const s of shardsToTry) {
          try {
            const baseUrl = `https://api.${s}.cliniko.com/v1`;
            const response = await axios.get(`${baseUrl}/businesses`, {
              auth: { username: clinikApiKey, password: '' },
              timeout: 15000,
              headers: {
                Accept: 'application/json',
                'User-Agent': 'SwiftClinic Admin/1.0 (support@swiftclinic.ai)'
              }
            });
            const businesses = (response.data?.businesses || []).map((b: any) => ({
              id: String(b.id),
              name: b.name,
              time_zone: b.time_zone,
              raw: b
            }));
            return res.json({ success: true, data: { shard: s, businesses } });
          } catch (err: any) {
            // try next shard
            console.warn('Cliniko detect failed on shard', s, err?.response?.status || err?.code || err?.message);
          }
        }

        return res.status(400).json({ success: false, error: 'Could not detect shard or fetch businesses with provided API key' });
      } catch (error) {
        console.error('cliniko/detect error:', error);
        return res.status(500).json({ success: false, error: 'Detection failed' });
      }
    });

    // Testing endpoint for specific clinic
    this.app.post('/test/:webhookId', this.testConnection.bind(this));

    // Get clinic info endpoint
    this.app.get('/clinic/:webhookId/info', this.getClinicInfo.bind(this));

    // NEW: Conversation approval endpoints for positive-only learning
    this.app.get('/admin/conversations/pending', this.getPendingConversations.bind(this));
    this.app.get('/admin/conversations/:sessionId', this.getConversationDetails.bind(this));
    this.app.post('/admin/conversations/:sessionId/approve', this.approveConversation.bind(this));
    this.app.post('/admin/conversations/:sessionId/reject', this.rejectConversation.bind(this));

    // Error handling
    this.app.use((error: any, req: any, res: any, next: any) => {
      console.error('Express error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'An unexpected error occurred',
        timestamp: new Date()
      });
    });
  }

  private async handleWebhookMessage(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { webhookId } = req.params;
      const { message, sessionId, userConsent, metadata } = req.body;

      if (!webhookId) {
        throw new Error('Webhook ID is required');
      }

      console.log(`[${req.id}] Processing webhook message for ${webhookId}:`, {
        messageLength: message.length,
        sessionId,
        userConsent
      });

      // Get clinic configuration and booking adapter with fallback handling
      const { config: clinicConfig, adapter: bookingAdapter } = await this.getClinicAndAdapter(webhookId);

      // Better session ID handling for conversation continuity
      let actualSessionId = sessionId;
      if (!actualSessionId) {
        // If no session ID provided, create a deterministic one based on clinic and timestamp
        // This allows for some continuity within short time windows
        actualSessionId = `${clinicConfig.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log(`[${req.id}] Generated new session ID: ${actualSessionId}`);
      } else {
        console.log(`[${req.id}] Using provided session ID: ${actualSessionId}`);
      }

      // Prepare chat request
      const chatRequest: ChatRequest = {
        message,
        sessionId: actualSessionId,
        clinicConfig,
        userConsent: userConsent !== false, // Default to true if not specified
        metadata
      };

      // Process message with LLM brain (includes fallback handling)
      const llmResponse: LLMResponse = await this.llmBrain.processMessage(chatRequest, bookingAdapter);

      // Check if we're in fallback mode and adjust response accordingly
      if ('isMockAdapter' in bookingAdapter && (bookingAdapter as any).isMockAdapter()) {
        // Add fallback mode indicator to metadata
        llmResponse.metadata.fallbackMode = true;
        llmResponse.metadata.bookingSystemStatus = 'unavailable';
      }

      // Log successful processing
      console.log(`[${req.id}] Successfully processed message`, {
        intent: llmResponse.metadata.intent,
        confidence: llmResponse.metadata.confidence,
        functionCalls: llmResponse.functionCalls.length,
        responseLength: llmResponse.message.length,
        fallbackMode: llmResponse.metadata.fallbackMode || false
      });

      // Return response with session ID for client to use in follow-up messages
      const response: APIResponse<{
        message: string;
        sessionId: string;
        requiresFollowUp: boolean;
        functionCalls: FunctionCall[];
        metadata: any;
      }> = {
        success: true,
        data: {
          message: llmResponse.message,
          sessionId: actualSessionId, // Return session ID for continuity
          requiresFollowUp: llmResponse.requiresFollowUp,
          functionCalls: llmResponse.functionCalls, // Add this line to include function calls in response
          metadata: llmResponse.metadata
        },
        timestamp: new Date()
      };

      res.json(response);

    } catch (error) {
      console.error(`[${req.id}] Error processing webhook message:`, error);
      
      // Use fallback manager to provide appropriate error response
      const errorMessage = this.fallbackManager.getErrorMessage(error, 'webhook_processing');
      
      const errorResponse: APIResponse<null> = {
        success: false,
        error: {
          code: 'PROCESSING_ERROR',
          message: errorMessage
        },
        timestamp: new Date()
      };

      res.status(500).json(errorResponse);
    }
  }

  private async testConnection(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { webhookId } = req.params;

      if (!webhookId) {
        throw new Error('Webhook ID is required');
      }

      console.log(`[${req.id}] Testing booking connection for ${webhookId}`);

      // Get clinic configuration
      const clinicConfig = await this.getClinicConfig(webhookId);
      
      // Test connection using enhanced adapter factory
      const connectionResult = await BookingAdapterFactory.testConnection(clinicConfig);

      const response: APIResponse<typeof connectionResult> = {
        success: true,
        data: connectionResult,
        timestamp: new Date()
      };

      res.json(response);

    } catch (error) {
      console.error(`[${req.id}] Error testing connection:`, error);
      
      const response: APIResponse = {
        success: false,
        error: {
          code: 'CONNECTION_TEST_ERROR',
          message: error instanceof Error ? error.message : 'Failed to test connection'
        },
        timestamp: new Date()
      };

      res.status(500).json(response);
    }
  }

  private async getClinicInfo(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { webhookId } = req.params;
      
      if (!webhookId) {
        res.status(400).json({
          success: false,
          error: 'Webhook ID is required'
        });
        return;
      }

      const clinicConfig = await this.getClinicConfig(webhookId);
      const { config: clinicConfigFull, adapter: bookingAdapter } = await this.getClinicAndAdapter(webhookId);

      // Return clinic information (excluding sensitive data)
      res.json({
        success: true,
        data: {
          name: clinicConfig.name,
          services: clinicConfig.services,
          businessHours: clinicConfig.businessHours,
          timezone: clinicConfigFull.timezone || 'UTC',
          bookingSystem: clinicConfig.bookingSystem,
          isActive: clinicConfig.isActive
        }
      });

    } catch (error) {
      console.error('Error getting clinic info:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get clinic information'
      });
    }
  }

  // NEW: Conversation approval endpoints for positive-only learning

  private async getPendingConversations(req: express.Request, res: express.Response): Promise<void> {
    try {
      const pending = this.llmBrain.getConversationManager().getPendingApprovalConversations();
      
      res.json({
        success: true,
        data: {
          pendingConversations: pending,
          count: pending.length
        }
      });
    } catch (error) {
      console.error('Error getting pending conversations:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get pending conversations'
      });
    }
  }

  private async getConversationDetails(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      
      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'Session ID is required'
        });
        return;
      }

      const details = this.llmBrain.getConversationManager().getConversationForReview(sessionId);
      
      if (!details) {
        res.status(404).json({
          success: false,
          error: 'Conversation not found'
        });
        return;
      }

      res.json({
        success: true,
        data: details
      });
    } catch (error) {
      console.error('Error getting conversation details:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get conversation details'
      });
    }
  }

  private async approveConversation(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { qualityRating } = req.body;
      
      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'Session ID is required'
        });
        return;
      }

      const rating = qualityRating || 'good';
      if (!['excellent', 'good', 'poor'].includes(rating)) {
        res.status(400).json({
          success: false,
          error: 'Invalid quality rating. Must be: excellent, good, or poor'
        });
        return;
      }

      const success = await this.llmBrain.getConversationManager().approveConversationForLearning(sessionId, rating);
      
      if (success) {
        res.json({
          success: true,
          message: `Conversation ${sessionId} approved for learning with ${rating} rating`
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Failed to approve conversation'
        });
      }
    } catch (error) {
      console.error('Error approving conversation:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to approve conversation'
      });
    }
  }

  private async rejectConversation(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      
      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'Session ID is required'
        });
        return;
      }

      const success = this.llmBrain.getConversationManager().rejectConversation(sessionId);
      
      if (success) {
        res.json({
          success: true,
          message: `Conversation ${sessionId} rejected and removed from memory`
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Conversation not found'
        });
      }
    } catch (error) {
      console.error('Error rejecting conversation:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reject conversation'
      });
    }
  }

  private async getClinicConfig(webhookId: string): Promise<ClinicConfig> {
    // Check cache first (5 minutes TTL)
    const cached = this.clinicConfigCache.get(webhookId);
    if (cached && Date.now() - cached.cachedAt < 5 * 60 * 1000) {
      return cached.config;
    }

    try {
      console.log(`[DEBUG] Loading clinic for webhook: ${webhookId}`);
      const clinicConfig = await this.database.getClinicByWebhook(webhookId);
      if (!clinicConfig) {
        throw new Error('Clinic configuration not found');
      }

      // Cache and return
      this.clinicConfigCache.set(webhookId, { config: clinicConfig, cachedAt: Date.now() });
      return clinicConfig;
    } catch (error) {
      console.error(`[DEBUG] Error loading clinic:`, error);
      
      // Fall back to environment configuration if database fails
      console.warn('⚠️ [DEBUG] Database error, using emergency fallback configuration');
      const scenario = this.fallbackManager.handleFallbackScenario('general_error', { error, webhookId });
      return this.fallbackManager.createFallbackClinicConfig(webhookId);
    }
  }

  private async getClinicAndAdapter(webhookId: string): Promise<{ config: ClinicConfig; adapter: BaseBookingAdapter }> {
    // Check cache first (5 minutes TTL)
    const cached = this.clinicAdapterCache.get(webhookId);
    if (cached && Date.now() - cached.cachedAt < 5 * 60 * 1000) {
      return { config: cached.config, adapter: cached.adapter };
    }

    // Get clinic config and create adapter with fallback handling
    const config = await this.getClinicConfig(webhookId);
    const adapter = await BookingAdapterFactory.createAdapter(config);

    const result = { config, adapter };
    
    // Cache result with timestamp
    this.clinicAdapterCache.set(webhookId, { 
      config: result.config, 
      adapter: result.adapter,
      cachedAt: Date.now() 
    });

    return result;
  }

  async initialize(): Promise<void> {
    try {
      // Initialize database connection
      const masterPassword = process.env.MASTER_PASSWORD || 'default-password-change-me';
      const dbPath = path.resolve(__dirname, '../../../data/dashboard.db');
      
      this.database = new SecureDatabase(dbPath, masterPassword);
      await this.database.initialize();
      
      console.log('Webhook API database connected successfully');

      // Initialize fallback manager
      this.fallbackManager = new FallbackManager();
      console.log('Fallback manager initialized successfully');

      // Initialize LLM brain with database after database is ready
      this.llmBrain = new LLMBrain(this.database);

      // Initialize encryption service
      this.encryptionService = new EncryptionService(masterPassword);

      console.log('Webhook API initialized successfully');
      this.isReady = true;

    } catch (error) {
      console.error('Failed to initialize webhook API server:', error);
      throw error;
    }
  }

  async start(port: number = 3002): Promise<void> {
    // Start HTTP server first so health endpoints are reachable even if init fails
    this.server = createServer(this.app);

    // Graceful shutdown
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('SIGINT', () => this.gracefulShutdown());

    this.server.listen(port, '0.0.0.0', () => {
      console.log(`🤖 Webhook API server running on port ${port}`);
      console.log(`🔒 Security and rate limiting enabled`);

      // Initialize asynchronously; don't block server readiness
      this.initialize().catch((err) => {
        console.error('⚠️ Failed to fully initialize on startup. Running in fallback mode:', err);
        // Keep server alive; healthz remains 200, readyz stays 503
      });
    });
  }

  private async gracefulShutdown(): Promise<void> {
    console.log('Webhook API shutting down gracefully...');

    if (this.server) {
      this.server.close(async () => {
        console.log('Webhook API server closed');
        
        if (this.database) {
          await this.database.close();
          console.log('Database connections closed');
        }

        process.exit(0);
      });
    }

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  }
}

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  const server = new WebhookAPIServer();
  // Prefer platform-provided PORT, then fallback to WEBHOOK_PORT, then default
  const port = parseInt(process.env.PORT || process.env.WEBHOOK_PORT || '3002', 10);
  
  server.start(port).catch((error) => {
    console.error('Failed to start webhook API server:', error);
    process.exit(1);
  });
}

export { WebhookAPIServer }; 