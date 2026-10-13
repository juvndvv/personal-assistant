export interface User {
  id: number;
  name: string;
  email: string;
}

export interface DataEnvelope<T> {
  data: T;
}

export interface ValidationErrorBody {
  message: string;
  errors?: Record<string, string[]>;
}

export interface LoginCredentials {
  email: string;
  password: string;
  remember: boolean;
}
