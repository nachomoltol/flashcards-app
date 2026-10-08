export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type CardFormat = 'basic' | 'multiple_choice' | 'cloze' | 'true_false';

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      cards: {
        Row: {
          back: string
          card_type: string
          card_format?: CardFormat
          cardFormat?: CardFormat
          created_at: string
          deck_id: string
          difficulty: number
          due: string
          front: string
          id: string
          lapses: number
          last_review: string | null
          note_id: string | null
          reps: number
          stability: number
          state: number
          updated_at: string
        }
        Insert: {
          back?: string
          card_type?: string
          card_format?: CardFormat
          cardFormat?: CardFormat
          created_at?: string
          deck_id: string
          difficulty?: number
          due?: string
          front?: string
          id?: string
          lapses?: number
          last_review?: string | null
          note_id?: string | null
          reps?: number
          stability?: number
          state?: number
          updated_at?: string
        }
        Update: {
          back?: string
          card_type?: string
          card_format?: CardFormat
          cardFormat?: CardFormat
          created_at?: string
          deck_id?: string
          difficulty?: number
          due?: string
          front?: string
          id?: string
          lapses?: number
          last_review?: string | null
          note_id?: string | null
          reps?: number
          stability?: number
          state?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      decks: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_collaborative: boolean
          is_folder: boolean
          is_public: boolean
          parent_id: string | null
          share_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_collaborative?: boolean
          is_folder?: boolean
          is_public?: boolean
          parent_id?: string | null
          share_id?: string | null
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_collaborative?: boolean
          is_folder?: boolean
          is_public?: boolean
          parent_id?: string | null
          share_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          created_at: string
          deck_id: string
          fields: Json
          id: string
          note_type: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deck_id: string
          fields?: Json
          id?: string
          note_type?: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deck_id?: string
          fields?: Json
          id?: string
          note_type?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          enable_fuzz: boolean | null
          full_name: string | null
          id: string
          maximum_interval: number | null
          request_retention: number | null
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          enable_fuzz?: boolean | null
          full_name?: string | null
          id: string
          maximum_interval?: number | null
          request_retention?: number | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          enable_fuzz?: boolean | null
          full_name?: string | null
          id?: string
          maximum_interval?: number | null
          request_retention?: number | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      reviews: {
        Row: {
          card_id: string
          created_at: string
          difficulty: number
          due: string
          id: string
          rating: number
          stability: number
          state: number
          user_id: string
        }
        Insert: {
          card_id: string
          created_at?: string
          difficulty: number
          due: string
          id?: string
          rating: number
          stability: number
          state: number
          user_id?: string
        }
        Update: {
          card_id?: string
          created_at?: string
          difficulty?: number
          due?: string
          id?: string
          rating?: number
          stability?: number
          state?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      import_shared_deck: {
        Args: {
          p_share_id: string
          p_target_user_id: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never
