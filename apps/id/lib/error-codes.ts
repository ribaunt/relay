import { createErrorResponse } from './api-response';
import { NextResponse } from 'next/server';

export enum ErrorCode {
  // Authentication Errors
  AUTH_FAILED = 'AUTH_FAILED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_INVALID = 'SESSION_INVALID',

  // Registration Errors
  EMAIL_ALREADY_REGISTERED = 'EMAIL_ALREADY_REGISTERED',
  INVALID_EMAIL_FORMAT = 'INVALID_EMAIL_FORMAT',
  EMAIL_TOO_LONG = 'EMAIL_TOO_LONG',

  // Verification Errors
  VERIFICATION_CODE_INVALID = 'VERIFICATION_CODE_INVALID',
  VERIFICATION_CODE_EXPIRED = 'VERIFICATION_CODE_EXPIRED',
  VERIFICATION_ATTEMPTS_EXCEEDED = 'VERIFICATION_ATTEMPTS_EXCEEDED',

  // Rate Limiting
  RATE_LIMITED = 'RATE_LIMITED',
  TOO_MANY_ATTEMPTS = 'TOO_MANY_ATTEMPTS',

  // Validation Errors
  INVALID_REQUEST_BODY = 'INVALID_REQUEST_BODY',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_FIELD_TYPE = 'INVALID_FIELD_TYPE',
  FIELD_TOO_LONG = 'FIELD_TOO_LONG',
  FIELD_TOO_SHORT = 'FIELD_TOO_SHORT',

  // Crypto Errors
  INVALID_SRP_PROOF = 'INVALID_SRP_PROOF',
  SRP_HANDSHAKE_EXPIRED = 'SRP_HANDSHAKE_EXPIRED',
  KEY_DERIVATION_FAILED = 'KEY_DERIVATION_FAILED',
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED',

  // File/Upload Errors (for future use - profile images, etc.)
  UNSUPPORTED_FILE_TYPE = 'UNSUPPORTED_FILE_TYPE',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  FILE_UPLOAD_FAILED = 'FILE_UPLOAD_FAILED',
  INVALID_IMAGE_FORMAT = 'INVALID_IMAGE_FORMAT',

  // Security/Policy Errors
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  PASSWORD_REQUIRED = 'PASSWORD_REQUIRED',
  TWO_FACTOR_REQUIRED = 'TWO_FACTOR_REQUIRED',

  // System Errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  DEPENDENCY_ERROR = 'DEPENDENCY_ERROR'
}

export interface ErrorDetails {
  code: ErrorCode;
  field?: string;
  constraint?: string;
  allowedValues?: string[];
  maxSize?: number;
  maxAttempts?: number;
  currentAttempts?: number;
  retryAfterSeconds?: number;
  documentationUrl?: string;
  suggestions?: string[];
}

export const ERROR_MESSAGES: Record<
  ErrorCode,
  { message: string; details: string; suggestions: string[] }
> = {
  [ErrorCode.AUTH_FAILED]: {
    message: 'Authentication failed',
    details:
      'Your credentials could not be verified. Please check your email and password.',
    suggestions: [
      'If using a password manager (e.g., Bitwarden, 1Password, LastPass), ensure the "Show Password" button is not being blocked by the password manager autofill overlay',
      'Try manually typing your password instead of using autofill',
      "Check that you're using the correct email address",
      "If you've forgotten your password, use the recovery key process"
    ]
  },

  [ErrorCode.INVALID_CREDENTIALS]: {
    message: 'Invalid credentials',
    details: 'The email or password you entered is incorrect.',
    suggestions: [
      'Password managers sometimes autofill masked characters. Try typing manually.',
      'Some password managers block the "Show Password" button. Try toggling the password field manually.',
      'Check caps lock and ensure your keyboard language is correct'
    ]
  },

  [ErrorCode.SESSION_INVALID]: {
    message: 'Invalid session',
    details: 'Your session could not be validated. Please sign in again.',
    suggestions: [
      'Sign in to continue',
      'Your session may have been revoked',
      'Try a different browser or device'
    ]
  },

  [ErrorCode.INVALID_EMAIL_FORMAT]: {
    message: 'Invalid email format',
    details: 'Please enter a valid email address.',
    suggestions: [
      'Email must contain @ symbol',
      'Check for typos',
      'Use a standard email format (e.g., user@example.com)'
    ]
  },

  [ErrorCode.EMAIL_TOO_LONG]: {
    message: 'Email too long',
    details: 'Email addresses must be 320 characters or less.',
    suggestions: [
      'Use a shorter email address',
      'Email aliases cannot exceed this limit'
    ]
  },

  [ErrorCode.EMAIL_ALREADY_REGISTERED]: {
    message: 'Email already registered',
    details: 'An account with this email address already exists.',
    suggestions: [
      'If this is your email, try signing in instead',
      'If you forgot your password, use password recovery',
      'If you believe this is an error, contact support'
    ]
  },

  [ErrorCode.VERIFICATION_CODE_INVALID]: {
    message: 'Invalid verification code',
    details: 'The verification code you entered is incorrect.',
    suggestions: [
      'Copy and paste the code from your email instead of typing it',
      "Check that the code hasn't expired (24-hour limit)",
      "Ensure you're using the most recent verification email sent to you"
    ]
  },

  [ErrorCode.VERIFICATION_CODE_EXPIRED]: {
    message: 'Verification code expired',
    details: 'The verification code has expired. Please request a new one.',
    suggestions: [
      'Request a new verification code',
      'Codes expire after 24 hours'
    ]
  },

  [ErrorCode.VERIFICATION_ATTEMPTS_EXCEEDED]: {
    message: 'Too many verification attempts',
    details: 'You have exceeded the maximum number of verification attempts.',
    suggestions: ['Request a new verification code', 'Wait before trying again']
  },

  [ErrorCode.RATE_LIMITED]: {
    message: 'Too many requests',
    details:
      'You have made too many requests. Please wait before trying again.',
    suggestions: [
      'Wait 15 minutes before attempting again',
      'Rate limits protect against automated attacks',
      'If you believe this is an error, contact support with your request ID'
    ]
  },

  [ErrorCode.TOO_MANY_ATTEMPTS]: {
    message: 'Too many attempts',
    details:
      'You have made too many unsuccessful attempts. Please wait before trying again.',
    suggestions: [
      'Wait a few minutes before retrying',
      'Check your credentials'
    ]
  },

  [ErrorCode.INVALID_REQUEST_BODY]: {
    message: 'Invalid request',
    details:
      "The request body could not be processed. Please ensure you're sending valid JSON.",
    suggestions: [
      'Check the API documentation',
      'Ensure Content-Type is application/json'
    ]
  },

  [ErrorCode.MISSING_REQUIRED_FIELD]: {
    message: 'Missing required field',
    details: 'One or more required fields are missing from your request.',
    suggestions: [
      'Check the API documentation for required fields',
      'Ensure all required fields are included'
    ]
  },

  [ErrorCode.INVALID_FIELD_TYPE]: {
    message: 'Invalid field type',
    details: 'One or more fields have the wrong type.',
    suggestions: [
      'Check the API documentation for field types',
      'Ensure numbers are sent as numbers, not strings'
    ]
  },

  [ErrorCode.FIELD_TOO_LONG]: {
    message: 'Field too long',
    details: 'One or more fields exceed the maximum allowed length.',
    suggestions: [
      'Check field length limits in documentation',
      'Truncate long values'
    ]
  },

  [ErrorCode.FIELD_TOO_SHORT]: {
    message: 'Field too short',
    details: 'One or more fields are below the minimum required length.',
    suggestions: [
      'Check field minimum length requirements',
      'Provide longer values'
    ]
  },

  [ErrorCode.INVALID_SRP_PROOF]: {
    message: 'Invalid SRP proof',
    details: 'The SRP proof verification failed. Please try logging in again.',
    suggestions: [
      'Start the login process from the beginning',
      'Ensure your client supports SRP v3'
    ]
  },

  [ErrorCode.SRP_HANDSHAKE_EXPIRED]: {
    message: 'SRP handshake expired',
    details:
      'The SRP handshake has expired (60-second limit). Please start over.',
    suggestions: [
      'Start the login process again',
      'Complete the login flow within 60 seconds'
    ]
  },

  [ErrorCode.KEY_DERIVATION_FAILED]: {
    message: 'Key derivation failed',
    details: 'Failed to derive encryption keys. Please try again.',
    suggestions: [
      'Check your password',
      'Ensure client-side crypto is working correctly'
    ]
  },

  [ErrorCode.ENCRYPTION_FAILED]: {
    message: 'Encryption failed',
    details: 'Failed to encrypt data. Please try again.',
    suggestions: [
      'Check browser compatibility',
      'Ensure Web Crypto API is available'
    ]
  },

  [ErrorCode.UNSUPPORTED_FILE_TYPE]: {
    message: 'Unsupported file type',
    details:
      'The file you uploaded is not supported. Supported formats: JPEG, PNG, WebP, GIF.',
    suggestions: [
      'Convert your image to JPEG or PNG format',
      'Ensure the file has a valid image extension (.jpg, .jpeg, .png, .webp, .gif)',
      'Some file managers may add metadata. Try re-saving the image',
      'Avoid uploading HEIC files from iOS - convert to JPEG first'
    ]
  },

  [ErrorCode.INVALID_IMAGE_FORMAT]: {
    message: 'Invalid image format',
    details:
      'The image could not be processed. This may be due to corruption or unsupported encoding.',
    suggestions: [
      'Try opening the image in another application and re-saving it',
      'Ensure the image is not corrupted',
      'Check that the file extension matches the actual format',
      'Try a different image format (PNG, JPEG)'
    ]
  },

  [ErrorCode.FILE_TOO_LARGE]: {
    message: 'File too large',
    details: 'The file you uploaded exceeds the maximum allowed size.',
    suggestions: [
      'Compress your image before uploading',
      'Use an online image compressor to reduce file size',
      'Crop unnecessary areas of the image'
    ]
  },

  [ErrorCode.FILE_UPLOAD_FAILED]: {
    message: 'File upload failed',
    details: 'Failed to upload the file. Please try again.',
    suggestions: [
      'Check your internet connection',
      'Try a different file',
      'Contact support if problem persists'
    ]
  },

  [ErrorCode.SESSION_EXPIRED]: {
    message: 'Session expired',
    details: 'Your session has expired due to inactivity.',
    suggestions: [
      'Sign in again to continue',
      'Sessions expire after 30 days of inactivity for security',
      'Consider using the "Remember me" option if available'
    ]
  },

  [ErrorCode.ACCOUNT_LOCKED]: {
    message: 'Account locked',
    details: 'Your account has been locked due to too many failed attempts.',
    suggestions: [
      'Wait before trying again',
      'Contact support if you believe this is an error',
      'Use password recovery if available'
    ]
  },

  [ErrorCode.PASSWORD_REQUIRED]: {
    message: 'Password required',
    details: 'A password is required to complete this action.',
    suggestions: [
      'Enter your password',
      'If you forgot it, use password recovery'
    ]
  },

  [ErrorCode.TWO_FACTOR_REQUIRED]: {
    message: 'Two-factor authentication required',
    details: 'You must complete two-factor authentication to continue.',
    suggestions: [
      'Enter the code from your authenticator app',
      'Use a backup code if unavailable'
    ]
  },

  [ErrorCode.INTERNAL_ERROR]: {
    message: 'An unexpected error occurred',
    details: 'Something went wrong on our end. Please try again later.',
    suggestions: [
      'Refresh the page and try again',
      'Check your internet connection',
      'Clear your browser cache and try again',
      'If the problem persists, contact support with your request ID'
    ]
  },

  [ErrorCode.SERVICE_UNAVAILABLE]: {
    message: 'Service unavailable',
    details: 'The service is temporarily unavailable. Please try again later.',
    suggestions: [
      'Wait a few minutes and try again',
      'Check status.relay.re for updates'
    ]
  },

  [ErrorCode.DEPENDENCY_ERROR]: {
    message: 'Dependency error',
    details: 'A required service is currently unavailable.',
    suggestions: [
      'Wait a moment and try again',
      'Check your internet connection',
      'Contact support if problem persists'
    ]
  }
};

export function createDetailedErrorResponse(
  status: number,
  code: ErrorCode,
  requestId: string,
  details?: Partial<ErrorDetails>
): NextResponse {
  const errorInfo = ERROR_MESSAGES[code];

  const body = {
    error: errorInfo.message,
    code,
    requestId,
    timestamp: new Date().toISOString(),
    details: {
      ...details,
      documentationUrl:
        details?.documentationUrl ||
        `https://docs.relay.re/errors/${code.toLowerCase()}`
    }
  };

  if (details?.retryAfterSeconds) {
    body.details.retryAfterSeconds = details.retryAfterSeconds;
  }

  const headers = new Headers();
  headers.set('Content-Type', 'application/problem+json; charset=utf-8');
  headers.set('X-Error-Code', code);

  if (details?.retryAfterSeconds) {
    headers.set('Retry-After', details.retryAfterSeconds.toString());
  }

  return NextResponse.json(body, {
    status,
    headers
  });
}

export function createImageUploadError(
  requestId: string,
  error: 'unsupported_type' | 'too_large' | 'invalid_format' | 'upload_failed',
  fileName?: string,
  fileSize?: number
): NextResponse {
  const errorMap = {
    unsupported_type: {
      code: ErrorCode.UNSUPPORTED_FILE_TYPE,
      status: 415,
      details: {
        field: 'file',
        allowedValues: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        fileName,
        maxSize: 5 * 1024 * 1024
      }
    },
    too_large: {
      code: ErrorCode.FILE_TOO_LARGE,
      status: 413,
      details: {
        field: 'file',
        fileSize,
        maxSize: 5 * 1024 * 1024,
        suggestions: ['Compress the image', 'Use a smaller image']
      }
    },
    invalid_format: {
      code: ErrorCode.INVALID_IMAGE_FORMAT,
      status: 422,
      details: {
        field: 'file',
        fileName,
        suggestions: [
          'The image file appears to be corrupted',
          'Try re-saving the image in a standard format',
          'Use PNG or JPEG instead of other formats'
        ]
      }
    },
    upload_failed: {
      code: ErrorCode.FILE_UPLOAD_FAILED,
      status: 500,
      details: {
        field: 'file',
        suggestions: [
          'Check your internet connection',
          'Try uploading the file again',
          'Ensure the file is not corrupted'
        ]
      }
    }
  };

  const errorConfig = errorMap[error];
  return createDetailedErrorResponse(
    errorConfig.status,
    errorConfig.code,
    requestId,
    errorConfig.details
  );
}

export function getPasswordManagerGuidance(): {
  title: string;
  description: string;
  commonIssues: string[];
  solutions: string[];
} {
  return {
    title: 'Password Manager Compatibility',
    description:
      'Some password managers may interfere with authentication forms. If you\'re experiencing issues with the "Show Password" button or autofill, try these solutions.',
    commonIssues: [
      'Password managers blocking the "Show Password" toggle button',
      'Autofill overlay covering submit buttons or input fields',
      'Masked characters being pasted instead of actual password',
      'Form submission intercepted by password manager'
    ],
    solutions: [
      'Temporarily disable password manager autofill for this site',
      'Manually type your password instead of using autofill',
      'Use a different browser or incognito/private mode to test',
      'If using Bitwarden, 1Password, or LastPass: Check extension settings for "Show" button permissions',
      'Copy-paste your password from the password manager instead of autofilling',
      'If the issue persists, try using a mobile device instead'
    ]
  };
}
