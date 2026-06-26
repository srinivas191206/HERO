import { localDb } from '../queue/OfflineDatabase';
import { clientPriorityEngine } from '../priority/PriorityEngine';
import { Evidence } from '../../types';
import { safeRandomUUID } from '../../utils/uuid';

// Browser-native SHA-256 hash generator
async function generateSha256(base64Str: string): Promise<string> {
  try {
    // Strip header prefix e.g. "data:image/jpeg;base64,"
    const cleanBase64 = base64Str.includes(',') ? base64Str.split(',')[1] : base64Str;
    const rawBinary = window.atob(cleanBase64);
    const bytes = new Uint8Array(rawBinary.length);
    for (let i = 0; i < rawBinary.length; i++) {
      bytes[i] = rawBinary.charCodeAt(i);
    }
    
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', bytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error('SHA-256 hashing failed, generating fallback UUID hash:', error);
    return 'sha256-fallback-' + safeRandomUUID();
  }
}

// Client-side image compression using canvas
function compressImage(base64Src: string, maxWidth = 800, maxHeight = 600, quality = 0.6): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Src;
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        // Compress as image/jpeg
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      } else {
        // Fallback if canvas context fails
        resolve(base64Src);
      }
    };
    img.onerror = () => {
      // Fallback if image fails to load
      resolve(base64Src);
    };
  });
}

export class EvidencePipeline {
  static async processAndQueue(
    officerId: string,
    incidentId: string | null,
    description: string,
    rawBase64Image: string,
    gps: { latitude: number; longitude: number } | null
  ): Promise<Evidence> {
    console.log('[EvidencePipeline] Starting image compression...');
    
    // 1. Compress Image
    const compressedImage = await compressImage(rawBase64Image);
    
    // 2. Compute SHA-256 checksum for integrity check
    console.log('[EvidencePipeline] Computing cryptographic integrity hash...');
    const hash = await generateSha256(compressedImage);

    // 3. Construct Evidence Model
    const evidenceId = safeRandomUUID();
    const timestamp = Date.now();

    const evidence: Evidence = {
      id: evidenceId,
      officerId,
      incidentId,
      description,
      filePath: compressedImage, // Simulating file storage inline as compressed base64
      hash,
      locationLat: gps?.latitude ?? null,
      locationLng: gps?.longitude ?? null,
      timestamp
    };

    // 4. Save to local Dexie Cache for immediate offline display
    await localDb.cachedEvidence.put({
      ...evidence,
      syncStatus: 'queued'
    });

    // 5. Enqueue into Priority Queue (Priority 7 = Evidence Upload)
    await clientPriorityEngine.enqueue(
      'evidence',
      7,
      evidence
    );

    console.log(`[EvidencePipeline] Completed. Evidence registered. ID: ${evidenceId}, SHA-256: ${hash}`);
    return evidence;
  }
}
