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
      activity_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          organization_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          organization_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_hours: {
        Row: {
          branch_id: string
          closes_at: string | null
          closes_next_day: boolean
          created_at: string
          day_of_week: number
          is_closed: boolean
          opens_at: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          closes_at?: string | null
          closes_next_day?: boolean
          created_at?: string
          day_of_week: number
          is_closed?: boolean
          opens_at?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          closes_at?: string | null
          closes_next_day?: boolean
          created_at?: string
          day_of_week?: number
          is_closed?: boolean
          opens_at?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_hours_branch_id_organization_id_fkey"
            columns: ["branch_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "branch_hours_branch_id_organization_id_fkey"
            columns: ["branch_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "my_branches"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "branch_hours_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          area: string | null
          business_day_start: string
          city: string | null
          contact_number: string | null
          created_at: string
          id: string
          is_active: boolean
          is_published: boolean
          latitude: number | null
          longitude: number | null
          name: string
          organization_id: string
          payment_instructions: Json | null
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          area?: string | null
          business_day_start?: string
          city?: string | null
          contact_number?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_published?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          organization_id: string
          payment_instructions?: Json | null
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          area?: string | null
          business_day_start?: string
          city?: string | null
          contact_number?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_published?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          organization_id?: string
          payment_instructions?: Json | null
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      member_branches: {
        Row: {
          branch_id: string
          created_at: string
          member_id: string
          organization_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          member_id: string
          organization_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          member_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_branches_branch_id_organization_id_fkey"
            columns: ["branch_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "member_branches_branch_id_organization_id_fkey"
            columns: ["branch_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "my_branches"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "member_branches_member_id_organization_id_fkey"
            columns: ["member_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "my_memberships"
            referencedColumns: ["member_id", "organization_id"]
          },
          {
            foreignKeyName: "member_branches_member_id_organization_id_fkey"
            columns: ["member_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "member_branches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          organization_id: string | null
          read_at: string | null
          recipient_user_id: string
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          organization_id?: string | null
          read_at?: string | null
          recipient_user_id: string
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          organization_id?: string | null
          read_at?: string | null
          recipient_user_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          branch_ids: string[]
          code: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["member_role"]
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          branch_ids: string[]
          code?: string
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          organization_id: string
          role: Database["public"]["Enums"]["member_role"]
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          branch_ids?: string[]
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["member_role"]
        }
        Relationships: [
          {
            foreignKeyName: "organization_invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          can_review_deposits: boolean
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          role: Database["public"]["Enums"]["member_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          can_review_deposits?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id: string
          role: Database["public"]["Enums"]["member_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          can_review_deposits?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          access_status: Database["public"]["Enums"]["org_access_status"]
          booking_horizon_days: number
          cancellation_policy: string | null
          category: Database["public"]["Enums"]["org_category"]
          created_at: string
          deposit_fixed_amount: number | null
          deposit_percent: number | null
          deposit_type: Database["public"]["Enums"]["deposit_type"]
          hold_minutes: number
          id: string
          is_listed: boolean
          logo_path: string | null
          min_notice_minutes: number
          name: string
          restricted_at: string | null
          restriction_reason:
            | Database["public"]["Enums"]["org_restriction_reason"]
            | null
          review_hours: number
          slot_interval_minutes: number
          slug: string
          terms_accepted_at: string | null
          terms_accepted_by: string | null
          updated_at: string
        }
        Insert: {
          access_status?: Database["public"]["Enums"]["org_access_status"]
          booking_horizon_days?: number
          cancellation_policy?: string | null
          category: Database["public"]["Enums"]["org_category"]
          created_at?: string
          deposit_fixed_amount?: number | null
          deposit_percent?: number | null
          deposit_type?: Database["public"]["Enums"]["deposit_type"]
          hold_minutes?: number
          id?: string
          is_listed?: boolean
          logo_path?: string | null
          min_notice_minutes?: number
          name: string
          restricted_at?: string | null
          restriction_reason?:
            | Database["public"]["Enums"]["org_restriction_reason"]
            | null
          review_hours?: number
          slot_interval_minutes?: number
          slug: string
          terms_accepted_at?: string | null
          terms_accepted_by?: string | null
          updated_at?: string
        }
        Update: {
          access_status?: Database["public"]["Enums"]["org_access_status"]
          booking_horizon_days?: number
          cancellation_policy?: string | null
          category?: Database["public"]["Enums"]["org_category"]
          created_at?: string
          deposit_fixed_amount?: number | null
          deposit_percent?: number | null
          deposit_type?: Database["public"]["Enums"]["deposit_type"]
          hold_minutes?: number
          id?: string
          is_listed?: boolean
          logo_path?: string | null
          min_notice_minutes?: number
          name?: string
          restricted_at?: string | null
          restriction_reason?:
            | Database["public"]["Enums"]["org_restriction_reason"]
            | null
          review_hours?: number
          slot_interval_minutes?: number
          slug?: string
          terms_accepted_at?: string | null
          terms_accepted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_terms_accepted_by_fkey"
            columns: ["terms_accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          created_at: string
          cutoff_schedule: Database["public"]["Enums"]["cutoff_schedule"]
          cutoff_weekday: number | null
          fee_maximum: number
          fee_minimum: number
          fee_percent: number
          grace_period_days: number
          id: boolean
          payment_instructions: Json
          statement_minimum: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          cutoff_schedule?: Database["public"]["Enums"]["cutoff_schedule"]
          cutoff_weekday?: number | null
          fee_maximum?: number
          fee_minimum?: number
          fee_percent?: number
          grace_period_days?: number
          id?: boolean
          payment_instructions?: Json
          statement_minimum?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          cutoff_schedule?: Database["public"]["Enums"]["cutoff_schedule"]
          cutoff_weekday?: number | null
          fee_maximum?: number
          fee_minimum?: number
          fee_percent?: number
          grace_period_days?: number
          id?: boolean
          payment_instructions?: Json
          statement_minimum?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          full_name: string | null
          id: string
          is_guest: boolean
          mobile_number: string | null
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_guest?: boolean
          mobile_number?: string | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_guest?: boolean
          mobile_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      my_branches: {
        Row: {
          business_day_start: string | null
          id: string | null
          name: string | null
          organization_id: string | null
          slug: string | null
          timezone: string | null
        }
        Insert: {
          business_day_start?: string | null
          id?: string | null
          name?: string | null
          organization_id?: string | null
          slug?: string | null
          timezone?: string | null
        }
        Update: {
          business_day_start?: string | null
          id?: string | null
          name?: string | null
          organization_id?: string | null
          slug?: string | null
          timezone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      my_memberships: {
        Row: {
          access_status: Database["public"]["Enums"]["org_access_status"] | null
          can_review_deposits: boolean | null
          member_id: string | null
          organization_id: string | null
          organization_name: string | null
          organization_slug: string | null
          role: Database["public"]["Enums"]["member_role"] | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_invite: { Args: { p_code: string }; Returns: string }
      create_invite: {
        Args: {
          p_branch_ids: string[]
          p_organization_id: string
          p_role: Database["public"]["Enums"]["member_role"]
        }
        Returns: {
          code: string
          expires_at: string
          invite_id: string
        }[]
      }
      create_organization: {
        Args: {
          p_address: string
          p_area: string
          p_branch_name: string
          p_category: Database["public"]["Enums"]["org_category"]
          p_city: string
          p_hours: Json
          p_organization_name: string
        }
        Returns: {
          branch_id: string
          organization_id: string
        }[]
      }
      get_invite_preview: {
        Args: { p_code: string }
        Returns: {
          branch_names: string[]
          expires_at: string
          organization_name: string
          role: Database["public"]["Enums"]["member_role"]
        }[]
      }
      remove_member: { Args: { p_member_id: string }; Returns: undefined }
      update_member: {
        Args: {
          p_branch_ids: string[]
          p_can_review_deposits: boolean
          p_member_id: string
          p_role: Database["public"]["Enums"]["member_role"]
        }
        Returns: undefined
      }
    }
    Enums: {
      cutoff_schedule: "weekly" | "semi_monthly" | "monthly"
      deposit_type: "fixed" | "percent"
      member_role: "owner" | "manager" | "staff"
      org_access_status: "active" | "restricted"
      org_category:
        | "salon"
        | "barbershop"
        | "spa"
        | "nails"
        | "lashes_brows"
        | "other"
      org_restriction_reason: "overdue_statement" | "manual"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      cutoff_schedule: ["weekly", "semi_monthly", "monthly"],
      deposit_type: ["fixed", "percent"],
      member_role: ["owner", "manager", "staff"],
      org_access_status: ["active", "restricted"],
      org_category: [
        "salon",
        "barbershop",
        "spa",
        "nails",
        "lashes_brows",
        "other",
      ],
      org_restriction_reason: ["overdue_statement", "manual"],
    },
  },
} as const

