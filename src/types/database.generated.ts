export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      artist_profiles: {
        Row: {
          kind: string
          profile_id: string
        }
        Insert: {
          kind?: string
          profile_id: string
        }
        Update: {
          kind?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_profiles_profile_id_kind_fkey"
            columns: ["profile_id", "kind"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "kind"]
          },
        ]
      }
      artist_styles: {
        Row: {
          id: string
          profile_id: string
          style: string
          substyle: string | null
        }
        Insert: {
          id?: string
          profile_id: string
          style: string
          substyle?: string | null
        }
        Update: {
          id?: string
          profile_id?: string
          style?: string
          substyle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artist_styles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "artist_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "artist_styles_style_fkey"
            columns: ["style"]
            isOneToOne: false
            referencedRelation: "music_styles"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "artist_styles_style_substyle_fkey"
            columns: ["style", "substyle"]
            isOneToOne: false
            referencedRelation: "music_substyles"
            referencedColumns: ["style", "name"]
          },
        ]
      }
      music_styles: {
        Row: {
          name: string
        }
        Insert: {
          name: string
        }
        Update: {
          name?: string
        }
        Relationships: []
      }
      music_substyles: {
        Row: {
          name: string
          style: string
        }
        Insert: {
          name: string
          style: string
        }
        Update: {
          name?: string
          style?: string
        }
        Relationships: [
          {
            foreignKeyName: "music_substyles_style_fkey"
            columns: ["style"]
            isOneToOne: false
            referencedRelation: "music_styles"
            referencedColumns: ["name"]
          },
        ]
      }
      professional_details: {
        Row: {
          audiovisual_type: string | null
          booking_email: string | null
          cnpj: string | null
          contact_email: string | null
          contact_phone: string | null
          fee_cents: number | null
          kind: string
          portfolio_url: string | null
          presskit_bytes: number | null
          presskit_path: string | null
          presskit_url: string | null
          profile_id: string
          service_other: string | null
          service_type: string | null
          services_pdf_bytes: number | null
          services_pdf_path: string | null
          updated_at: string
        }
        Insert: {
          audiovisual_type?: string | null
          booking_email?: string | null
          cnpj?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          fee_cents?: number | null
          kind: string
          portfolio_url?: string | null
          presskit_bytes?: number | null
          presskit_path?: string | null
          presskit_url?: string | null
          profile_id: string
          service_other?: string | null
          service_type?: string | null
          services_pdf_bytes?: number | null
          services_pdf_path?: string | null
          updated_at?: string
        }
        Update: {
          audiovisual_type?: string | null
          booking_email?: string | null
          cnpj?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          fee_cents?: number | null
          kind?: string
          portfolio_url?: string | null
          presskit_bytes?: number | null
          presskit_path?: string | null
          presskit_url?: string | null
          profile_id?: string
          service_other?: string | null
          service_type?: string | null
          services_pdf_bytes?: number | null
          services_pdf_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_details_profile_id_kind_fkey"
            columns: ["profile_id", "kind"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "kind"]
          },
        ]
      }
      profile_images: {
        Row: {
          alt_text: string
          id: string
          mime_type: string
          object_path: string
          position: number
          profile_id: string
          size_bytes: number
        }
        Insert: {
          alt_text?: string
          id?: string
          mime_type: string
          object_path: string
          position: number
          profile_id: string
          size_bytes: number
        }
        Update: {
          alt_text?: string
          id?: string
          mime_type?: string
          object_path?: string
          position?: number
          profile_id?: string
          size_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "profile_images_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "artist_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      profiles: {
        Row: {
          city: string
          color: string | null
          created_at: string
          description: string
          id: string
          kind: string
          name: string
          owner_id: string
          published: boolean
          social_links: Json
          state_code: string
          updated_at: string
        }
        Insert: {
          city: string
          color?: string | null
          created_at?: string
          description?: string
          id?: string
          kind: string
          name: string
          owner_id: string
          published?: boolean
          social_links?: Json
          state_code: string
          updated_at?: string
        }
        Update: {
          city?: string
          color?: string | null
          created_at?: string
          description?: string
          id?: string
          kind?: string
          name?: string
          owner_id?: string
          published?: boolean
          social_links?: Json
          state_code?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_registration: {
        Args: { account: Json; profile: Json; request_id: string }
        Returns: string
      }
      create_profile: { Args: { payload: Json }; Returns: string }
      get_profile: { Args: { target: string }; Returns: Json }
      set_default_artist: { Args: { target: string }; Returns: undefined }
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

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

