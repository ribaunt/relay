import { SeverityNumber } from '@opentelemetry/api-logs';
import { after, NextResponse } from 'next/server';
import { createJsonResponse, SECURITY_HEADERS } from '@/lib/api-response';
import { getPasswordManagerGuidance, ErrorCode } from '@/lib/error-codes';
import { loggerProvider } from '@/instrumentation';

const otelLogger = loggerProvider.getLogger('api.auth.guidance');

/**
 * GET /api/auth/guidance/password-manager
 *
 * Returns guidance for password manager compatibility issues.
 * Frontend can display this to users experiencing issues with
 * "Show Password" buttons, autofill, or similar problems.
 */
export async function GET(): Promise<NextResponse> {
  after(async () => {
    await loggerProvider.forceFlush();
  });

  otelLogger.emit({
    body: 'password manager guidance requested',
    severityNumber: SeverityNumber.INFO,
    attributes: {
      route: '/api/auth/guidance',
      method: 'GET'
    }
  });

  const guidance = getPasswordManagerGuidance();

  return createJsonResponse({
    ...guidance,
    supportedPasswordManagers: [
      'Bitwarden',
      '1Password',
      'LastPass',
      'Dashlane',
      'Enpass',
      'KeePassXC',
      'Proton Pass',
      'NordPass'
    ],
    knownIssues: {
      showButtonBlocked: {
        description:
          'Password manager overlay prevents clicking "Show Password" button',
        affectedManagers: ['Bitwarden', '1Password', 'LastPass'],
        workaround:
          'Click outside the password field first, then click "Show Password"'
      },
      autofillOverlay: {
        description: 'Autofill suggestion covers the submit button',
        affectedManagers: ['Bitwarden', '1Password', 'LastPass'],
        workaround:
          'Press Tab to move focus, or use keyboard shortcut (Enter) to submit'
      },
      maskedPaste: {
        description:
          'Pasting masked characters (••) instead of actual password',
        affectedManagers: ['Bitwarden', 'LastPass'],
        workaround:
          'Copy password to clipboard first, then paste in incognito window'
      }
    },
    browserSpecificWorkarounds: {
      chrome: [
        'Disable password manager extension temporarily',
        'Use chrome://extensions/ to manage extensions',
        'Try in Incognito mode (password managers typically disabled there)'
      ],
      firefox: [
        'Disable password autofill in about:preferences#privacy',
        'Use Shift+Delete to clear autofill suggestions',
        'Try in Private Browsing mode'
      ],
      safari: [
        'Disable AutoFill in Safari Preferences',
        'Check Safari Extensions preferences',
        'Use private browsing window (⌘+Shift+N)'
      ],
      edge: [
        'Disable password manager in edge://extensions',
        'Try InPrivate mode (Ctrl+Shift+P)'
      ]
    },
    diagnostics: {
      testPasswordToggle:
        'Try clicking "Show Password" - if nothing happens, password manager may be blocking it',
      testManualEntry: 'Try typing password manually with autofill disabled',
      testDifferentBrowser:
        'Try Chrome, Firefox, or Safari to isolate the issue',
      testIncognito:
        'Try in incognito/private mode where extensions are disabled'
    }
  });
}

/**
 * GET /api/auth/guidance/unsupported-image
 *
 * Returns guidance for image upload issues.
 * Frontend can display this when encountering unsupported format errors.
 */
export async function GET_IMAGE_ERROR_GUIDE(): Promise<NextResponse> {
  after(async () => {
    await loggerProvider.forceFlush();
  });

  otelLogger.emit({
    body: 'image upload guidance requested',
    severityNumber: SeverityNumber.INFO,
    attributes: {
      route: '/api/auth/guidance/unsupported-image',
      method: 'GET'
    }
  });

  return createJsonResponse({
    title: 'Image Upload Guidance',
    description: 'Supported formats and common issues with image uploads.',
    supportedFormats: [
      { mime: 'image/jpeg', extensions: ['.jpg', '.jpeg'], maxFileSize: '5MB' },
      { mime: 'image/png', extensions: ['.png'], maxFileSize: '5MB' },
      { mime: 'image/webp', extensions: ['.webp'], maxFileSize: '5MB' },
      { mime: 'image/gif', extensions: ['.gif'], maxFileSize: '5MB' }
    ],
    unsupportedFormats: [
      {
        format: 'HEIC',
        commonSource: 'iOS Photos',
        solution: 'Use Photos app: Export > JPEG'
      },
      {
        format: 'HEIF',
        commonSource: 'Modern iOS/Android',
        solution: 'Convert to JPEG or PNG'
      },
      {
        format: 'TIFF',
        commonSource: 'Scanners/Photoshop',
        solution: 'Export as JPEG or PNG'
      },
      {
        format: 'BMP',
        commonSource: 'Windows Paint',
        solution: 'Save as JPEG or PNG'
      },
      {
        format: 'SVG',
        commonSource: 'Vector graphics',
        solution: 'Rasterize to PNG first'
      },
      {
        format: 'RAW',
        commonSource: 'DSLR cameras',
        solution: 'Convert to JPEG before uploading'
      }
    ],
    commonIssues: [
      {
        issue: 'File extension mismatch (e.g., .heic file named image.png)',
        solution:
          'Rename the file to match its actual format, or convert to a supported format'
      },
      {
        issue: 'Corrupted image file',
        solution: 'Open the image in Preview/Photos and re-save it'
      },
      {
        issue: 'File too large',
        solution: 'Use an image compressor (TinyPNG, Squoosh, or online tools)'
      },
      {
        issue: 'Hidden metadata or EXIF data causing issues',
        solution:
          'Strip metadata using a tool before uploading, or re-save in a plain format'
      }
    ],
    recommendedTools: [
      {
        name: 'TinyPNG',
        url: 'https://tinypng.com/',
        purpose: 'PNG compression'
      },
      {
        name: 'Squoosh',
        url: 'https://squoosh.app/',
        purpose: 'JPEG/PNG/WebP compression'
      },
      {
        name: 'CloudConvert',
        url: 'https://cloudconvert.com/',
        purpose: 'Format conversion'
      },
      {
        name: 'Preview (macOS)',
        url: 'app://preview',
        purpose: 'Image validation and conversion'
      },
      {
        name: 'Photos (Windows)',
        url: 'microsoft.windows.photos',
        purpose: 'Image validation and conversion'
      }
    ]
  });
}
