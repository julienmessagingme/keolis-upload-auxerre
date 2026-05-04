const express = require('express');
const router = express.Router();
const knowledgeController = require('./knowledge.controller');
const middleware = require('../../middleware');

router.post(
  '/upload-file',
  middleware.requireAuth,
  middleware.upload.single('file'),
  middleware.handleUploadError,
  (req, res) => knowledgeController.uploadFile(req, res)
);

router.post(
  '/upload-text',
  middleware.requireAuth,
  (req, res) => knowledgeController.uploadText(req, res)
);

router.get(
  '/history',
  middleware.requireAuth,
  (req, res) => knowledgeController.getHistory(req, res)
);

router.get(
  '/search',
  middleware.requireAuth,
  (req, res) => knowledgeController.search(req, res)
);

router.post(
  '/upload-qa',
  middleware.requireAuth,
  (req, res) => knowledgeController.uploadQA(req, res)
);

router.put(
  '/update-qa/:itemId',
  middleware.requireAuth,
  (req, res) => knowledgeController.updateQA(req, res)
);

router.delete(
  '/delete-qa/:itemId',
  middleware.requireAuth,
  (req, res) => knowledgeController.deleteQA(req, res)
);

router.post(
  '/import-excel',
  middleware.requireAuth,
  express.json({ limit: '5mb' }),
  (req, res) => knowledgeController.importExcel(req, res)
);

module.exports = router;
