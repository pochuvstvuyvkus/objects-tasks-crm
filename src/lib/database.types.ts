// Типы схемы public в формате `supabase gen types typescript`.
// Соответствуют supabase/migrations/*.sql. После изменения схемы можно перегенерировать:
//   npx supabase gen types typescript --project-id <ref> --schema public > src/lib/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '13.0.5';
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          role: Database['public']['Enums']['user_role'];
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          email?: string;
          role?: Database['public']['Enums']['user_role'];
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          email?: string;
          role?: Database['public']['Enums']['user_role'];
          created_at?: string;
        };
        Relationships: [];
      };
      objects: {
        Row: {
          id: string;
          name: string;
          address: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          address: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          address?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'objects_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      tasks: {
        Row: {
          id: string;
          title: string;
          description: string;
          object_id: string;
          assignee_id: string;
          status: Database['public']['Enums']['task_status'];
          author_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string;
          object_id: string;
          assignee_id: string;
          status?: Database['public']['Enums']['task_status'];
          author_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string;
          object_id?: string;
          assignee_id?: string;
          status?: Database['public']['Enums']['task_status'];
          author_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tasks_object_id_fkey';
            columns: ['object_id'];
            isOneToOne: false;
            referencedRelation: 'objects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tasks_assignee_id_fkey';
            columns: ['assignee_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tasks_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      task_history: {
        Row: {
          id: number;
          task_id: string;
          from_status: Database['public']['Enums']['task_status'] | null;
          to_status: Database['public']['Enums']['task_status'];
          changed_by: string | null;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: never;
          task_id: string;
          from_status?: Database['public']['Enums']['task_status'] | null;
          to_status: Database['public']['Enums']['task_status'];
          changed_by?: string | null;
          comment?: string | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          task_id?: string;
          from_status?: Database['public']['Enums']['task_status'] | null;
          to_status?: Database['public']['Enums']['task_status'];
          changed_by?: string | null;
          comment?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_history_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_history_changed_by_fkey';
            columns: ['changed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      change_task_status: {
        Args: {
          p_task_id: string;
          p_to_status: Database['public']['Enums']['task_status'];
          p_comment?: string;
        };
        Returns: {
          id: string;
          title: string;
          description: string;
          object_id: string;
          assignee_id: string;
          status: Database['public']['Enums']['task_status'];
          author_id: string;
          created_at: string;
          updated_at: string;
        };
      };
    };
    Enums: {
      user_role: 'manager' | 'worker';
      task_status: 'new' | 'in_progress' | 'review' | 'accepted' | 'rework';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];

export type Profile = Tables<'profiles'>;
export type ObjectRow = Tables<'objects'>;
export type TaskRow = Tables<'tasks'>;
export type TaskHistoryRow = Tables<'task_history'>;
export type TaskStatus = Enums<'task_status'>;
export type UserRole = Enums<'user_role'>;
