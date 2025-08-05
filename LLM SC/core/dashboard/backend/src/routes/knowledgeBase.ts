import { Router, Request, Response } from 'express';
import { FirebaseService } from '../services/firebase';
import { EncryptionService } from '../../../../shared/security/encryption';
import { APIResponse } from '../../../../shared/types';
import { asyncErrorHandler } from '../middleware/errorHandler';
import crypto from 'crypto';

const createKnowledgeBaseRoutes = (firebaseService: FirebaseService, encryptionService: EncryptionService) => {
  const router = Router();

  // Get documents for a clinic
  router.get('/:clinicId', asyncErrorHandler(async (req: Request, res: Response) => {
    const clinicId = req.params.clinicId;
    const documents = await firebaseService.getDocuments(clinicId);
    
    const response: APIResponse<any[]> = {
      success: true,
      data: documents.map(doc => ({
        id: doc.id,
        clinicId: doc.clinicId,
        name: doc.name,
        type: doc.type,
        uploadedAt: doc.uploadedAt.toDate(),
        // Don't include full content in list view for performance
        hasContent: doc.content.length > 0
      })),
      timestamp: new Date()
    };
    res.json(response);
  }));

  // Upload new document
  router.post('/:clinicId/upload', asyncErrorHandler(async (req: Request, res: Response) => {
    const clinicId = req.params.clinicId;
    const { name, content, type } = req.body;
    
    if (!name || !content || !type) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'name, content, and type are required'
        },
        timestamp: new Date()
      });
    }

    if (!['pdf', 'text', 'webpage'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'type must be one of: pdf, text, webpage'
        },
        timestamp: new Date()
      });
    }

    // Generate checksum for content integrity
    const checksum = crypto.createHash('sha256').update(content).digest('hex');

    const documentId = await firebaseService.uploadDocument({
      clinicId,
      name,
      content,
      type,
      checksum
    });

    const response: APIResponse<{ id: string }> = {
      success: true,
      data: { id: documentId },
      timestamp: new Date()
    };
    return res.status(201).json(response);
  }));

  // Get specific document content
  router.get('/:clinicId/documents/:documentId', asyncErrorHandler(async (req: Request, res: Response) => {
    const { clinicId, documentId } = req.params;
    const documents = await firebaseService.getDocuments(clinicId);
    const document = documents.find(doc => doc.id === documentId);
    
    if (!document) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'DOCUMENT_NOT_FOUND',
          message: 'Document not found'
        },
        timestamp: new Date()
      });
    }

    const response: APIResponse<any> = {
      success: true,
      data: {
        id: document.id,
        clinicId: document.clinicId,
        name: document.name,
        content: document.content,
        type: document.type,
        checksum: document.checksum,
        uploadedAt: document.uploadedAt.toDate()
      },
      timestamp: new Date()
    };
    return res.json(response);
  }));

  // Delete document
  router.delete('/:clinicId/documents/:documentId', asyncErrorHandler(async (req: Request, res: Response) => {
    const documentId = req.params.documentId;
    await firebaseService.deleteDocument(documentId);
    
    const response: APIResponse<{ message: string }> = {
      success: true,
      data: { message: 'Document deleted successfully' },
      timestamp: new Date()
    };
    res.json(response);
  }));

  return router;
};

export default createKnowledgeBaseRoutes; 