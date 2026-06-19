export interface AuthUser {
  id: string;
  email: string;
  username: string | null;
  role: string;
  mustChangePassword: boolean;
  employeeId: string | null;
}

export interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: (token: string) => Promise<void>;
}
