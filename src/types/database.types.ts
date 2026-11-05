export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string;
          actor_user_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          metadata: NonNullable<Json>;
          organization_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_user_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          metadata?: NonNullable<Json>;
          organization_id?: string | null;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          metadata?: NonNullable<Json>;
          organization_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "activity_logs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      booking_services: {
        Row: {
          booking_id: string;
          buffer_minutes: number;
          created_at: string;
          duration_minutes: number;
          id: string;
          organization_id: string;
          price: number;
          service_id: string;
          service_name: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          booking_id: string;
          buffer_minutes: number;
          created_at?: string;
          duration_minutes: number;
          id?: string;
          organization_id: string;
          price: number;
          service_id: string;
          service_name: string;
          sort_order: number;
        };
        Update: {
          booking_id?: string;
          buffer_minutes?: number;
          created_at?: string;
          duration_minutes?: number;
          id?: string;
          organization_id?: string;
          price?: number;
          service_id?: string;
          service_name?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "booking_services_booking_id_organization_id_fkey";
            columns: ["booking_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "booking_services_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_services_service_id_organization_id_fkey";
            columns: ["service_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      bookings: {
        Row: {
          amount_due: number;
          booked_by: string;
          booking_code: string;
          branch_id: string;
          business_date: string;
          cancellation_metadata: Json | null;
          checked_in_at: string | null;
          client_id: string;
          client_note: string | null;
          completed_at: string | null;
          convenience_fee: number;
          created_at: string;
          deposit_amount: number;
          end_at: string | null;
          hold_expires_at: string | null;
          id: string;
          organization_id: string;
          payment_instructions_snapshot: Json | null;
          policy_acceptance_metadata: Json | null;
          queue_number: number | null;
          refund_metadata: Json | null;
          review_expires_at: string | null;
          review_reminder_sent_at: string | null;
          service_total: number;
          source: Database["public"]["Enums"]["booking_source"];
          staff_id: string | null;
          start_at: string | null;
          started_at: string | null;
          status: Database["public"]["Enums"]["booking_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount_due?: number;
          booked_by: string;
          booking_code: string;
          branch_id: string;
          business_date: string;
          cancellation_metadata?: Json | null;
          checked_in_at?: string | null;
          client_id: string;
          client_note?: string | null;
          completed_at?: string | null;
          convenience_fee?: number;
          created_at?: string;
          deposit_amount?: number;
          end_at?: string | null;
          hold_expires_at?: string | null;
          id?: string;
          organization_id: string;
          payment_instructions_snapshot?: Json | null;
          policy_acceptance_metadata?: Json | null;
          queue_number?: number | null;
          refund_metadata?: Json | null;
          review_expires_at?: string | null;
          review_reminder_sent_at?: string | null;
          service_total: number;
          source: Database["public"]["Enums"]["booking_source"];
          staff_id?: string | null;
          start_at?: string | null;
          started_at?: string | null;
          status: Database["public"]["Enums"]["booking_status"];
          updated_at?: string;
        };
        Update: {
          amount_due?: number;
          booked_by?: string;
          booking_code?: string;
          branch_id?: string;
          business_date?: string;
          cancellation_metadata?: Json | null;
          checked_in_at?: string | null;
          client_id?: string;
          client_note?: string | null;
          completed_at?: string | null;
          convenience_fee?: number;
          created_at?: string;
          deposit_amount?: number;
          end_at?: string | null;
          hold_expires_at?: string | null;
          id?: string;
          organization_id?: string;
          payment_instructions_snapshot?: Json | null;
          policy_acceptance_metadata?: Json | null;
          queue_number?: number | null;
          refund_metadata?: Json | null;
          review_expires_at?: string | null;
          review_reminder_sent_at?: string | null;
          service_total?: number;
          source?: Database["public"]["Enums"]["booking_source"];
          staff_id?: string | null;
          start_at?: string | null;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["booking_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_booked_by_fkey";
            columns: ["booked_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branch_setup_status";
            referencedColumns: ["branch_id", "organization_id"];
          },
          {
            foreignKeyName: "bookings_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "bookings_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "my_branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "bookings_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "public_branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "bookings_client_id_organization_id_fkey";
            columns: ["client_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "bookings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_staff_id_organization_id_fkey";
            columns: ["staff_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      branch_closures: {
        Row: {
          branch_id: string;
          created_at: string;
          ends_at: string;
          id: string;
          organization_id: string;
          reason: string | null;
          starts_at: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          created_at?: string;
          ends_at: string;
          id?: string;
          organization_id: string;
          reason?: string | null;
          starts_at: string;
          updated_at?: string;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          ends_at?: string;
          id?: string;
          organization_id?: string;
          reason?: string | null;
          starts_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "branch_closures_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branch_setup_status";
            referencedColumns: ["branch_id", "organization_id"];
          },
          {
            foreignKeyName: "branch_closures_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "branch_closures_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "my_branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "branch_closures_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "public_branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "branch_closures_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      branch_hours: {
        Row: {
          branch_id: string;
          closes_at: string | null;
          closes_next_day: boolean;
          created_at: string;
          day_of_week: number;
          is_closed: boolean;
          opens_at: string | null;
          organization_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          closes_at?: string | null;
          closes_next_day?: boolean;
          created_at?: string;
          day_of_week: number;
          is_closed?: boolean;
          opens_at?: string | null;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          branch_id?: string;
          closes_at?: string | null;
          closes_next_day?: boolean;
          created_at?: string;
          day_of_week?: number;
          is_closed?: boolean;
          opens_at?: string | null;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "branch_hours_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branch_setup_status";
            referencedColumns: ["branch_id", "organization_id"];
          },
          {
            foreignKeyName: "branch_hours_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "branch_hours_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "my_branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "branch_hours_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "public_branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "branch_hours_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      branch_media: {
        Row: {
          branch_id: string;
          created_at: string;
          id: string;
          organization_id: string;
          sort_order: number;
          storage_path: string;
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          created_at?: string;
          id?: string;
          organization_id: string;
          sort_order?: number;
          storage_path: string;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          id?: string;
          organization_id?: string;
          sort_order?: number;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "branch_media_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branch_setup_status";
            referencedColumns: ["branch_id", "organization_id"];
          },
          {
            foreignKeyName: "branch_media_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "branch_media_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "my_branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "branch_media_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "public_branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "branch_media_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      branch_services: {
        Row: {
          branch_id: string;
          created_at: string;
          organization_id: string;
          price_override: number | null;
          service_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          created_at?: string;
          organization_id: string;
          price_override?: number | null;
          service_id: string;
          updated_at?: string;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          organization_id?: string;
          price_override?: number | null;
          service_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "branch_services_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branch_setup_status";
            referencedColumns: ["branch_id", "organization_id"];
          },
          {
            foreignKeyName: "branch_services_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "branch_services_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "my_branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "branch_services_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "public_branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "branch_services_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "branch_services_service_id_organization_id_fkey";
            columns: ["service_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      branches: {
        Row: {
          address: string | null;
          area: string | null;
          business_day_start: string;
          city: string | null;
          contact_number: string | null;
          created_at: string;
          id: string;
          is_active: boolean;
          is_published: boolean;
          latitude: number | null;
          longitude: number | null;
          name: string;
          organization_id: string;
          payment_instructions: Json | null;
          slug: string;
          timezone: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          area?: string | null;
          business_day_start?: string;
          city?: string | null;
          contact_number?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_published?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          name: string;
          organization_id: string;
          payment_instructions?: Json | null;
          slug: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          area?: string | null;
          business_day_start?: string;
          city?: string | null;
          contact_number?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          is_published?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          name?: string;
          organization_id?: string;
          payment_instructions?: Json | null;
          slug?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "branches_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          created_at: string;
          full_name: string;
          id: string;
          mobile_number: string | null;
          notes: string | null;
          organization_id: string;
          updated_at: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          full_name: string;
          id?: string;
          mobile_number?: string | null;
          notes?: string | null;
          organization_id: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          id?: string;
          mobile_number?: string | null;
          notes?: string | null;
          organization_id?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clients_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_close_staff: {
        Row: {
          commission_amount: number;
          daily_close_id: string;
          organization_id: string;
          service_revenue: number;
          staff_id: string;
          tip_amount: number;
          visit_count: number;
        };
        ComputedFields: never;
        Insert: {
          commission_amount: number;
          daily_close_id: string;
          organization_id: string;
          service_revenue: number;
          staff_id: string;
          tip_amount: number;
          visit_count: number;
        };
        Update: {
          commission_amount?: number;
          daily_close_id?: string;
          organization_id?: string;
          service_revenue?: number;
          staff_id?: string;
          tip_amount?: number;
          visit_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "daily_close_staff_daily_close_id_organization_id_fkey";
            columns: ["daily_close_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "daily_closes";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "daily_close_staff_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "daily_close_staff_staff_id_organization_id_fkey";
            columns: ["staff_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      daily_closes: {
        Row: {
          branch_id: string;
          business_date: string;
          cash_counted: number;
          cash_expected: number;
          cash_float: number;
          cash_variance: number;
          closed_at: string;
          closed_by: string;
          created_at: string;
          deposits_applied: number;
          deposits_received: number;
          discounts: number;
          fees_collected: number;
          gross_sales: number;
          id: string;
          organization_id: string;
          reopened_at: string | null;
          reopened_by: string | null;
          tips: number;
          totals_by_method: NonNullable<Json>;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          business_date: string;
          cash_counted: number;
          cash_expected: number;
          cash_float?: number;
          cash_variance: number;
          closed_at: string;
          closed_by: string;
          created_at?: string;
          deposits_applied: number;
          deposits_received: number;
          discounts: number;
          fees_collected: number;
          gross_sales: number;
          id?: string;
          organization_id: string;
          reopened_at?: string | null;
          reopened_by?: string | null;
          tips: number;
          totals_by_method: NonNullable<Json>;
          updated_at?: string;
        };
        Update: {
          branch_id?: string;
          business_date?: string;
          cash_counted?: number;
          cash_expected?: number;
          cash_float?: number;
          cash_variance?: number;
          closed_at?: string;
          closed_by?: string;
          created_at?: string;
          deposits_applied?: number;
          deposits_received?: number;
          discounts?: number;
          fees_collected?: number;
          gross_sales?: number;
          id?: string;
          organization_id?: string;
          reopened_at?: string | null;
          reopened_by?: string | null;
          tips?: number;
          totals_by_method?: NonNullable<Json>;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_closes_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branch_setup_status";
            referencedColumns: ["branch_id", "organization_id"];
          },
          {
            foreignKeyName: "daily_closes_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "daily_closes_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "my_branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "daily_closes_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "public_branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "daily_closes_closed_by_fkey";
            columns: ["closed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "daily_closes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "daily_closes_reopened_by_fkey";
            columns: ["reopened_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      fee_entries: {
        Row: {
          accrued_at: string;
          amount: number;
          booking_id: string | null;
          branch_id: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          kind: Database["public"]["Enums"]["fee_entry_kind"];
          organization_id: string;
        };
        ComputedFields: never;
        Insert: {
          accrued_at: string;
          amount: number;
          booking_id?: string | null;
          branch_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["fee_entry_kind"];
          organization_id: string;
        };
        Update: {
          accrued_at?: string;
          amount?: number;
          booking_id?: string | null;
          branch_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["fee_entry_kind"];
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fee_entries_booking_id_organization_id_fkey";
            columns: ["booking_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "fee_entries_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branch_setup_status";
            referencedColumns: ["branch_id", "organization_id"];
          },
          {
            foreignKeyName: "fee_entries_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "fee_entries_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "my_branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "fee_entries_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "public_branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "fee_entries_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fee_entries_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      member_branches: {
        Row: {
          branch_id: string;
          created_at: string;
          member_id: string;
          organization_id: string;
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          created_at?: string;
          member_id: string;
          organization_id: string;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          member_id?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "member_branches_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branch_setup_status";
            referencedColumns: ["branch_id", "organization_id"];
          },
          {
            foreignKeyName: "member_branches_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "member_branches_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "my_branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "member_branches_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "public_branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "member_branches_member_id_organization_id_fkey";
            columns: ["member_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "my_memberships";
            referencedColumns: ["member_id", "organization_id"];
          },
          {
            foreignKeyName: "member_branches_member_id_organization_id_fkey";
            columns: ["member_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_members";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "member_branches_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          organization_id: string | null;
          read_at: string | null;
          recipient_user_id: string;
          title: string;
          type: string;
        };
        ComputedFields: never;
        Insert: {
          body?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          organization_id?: string | null;
          read_at?: string | null;
          recipient_user_id: string;
          title: string;
          type: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          organization_id?: string | null;
          read_at?: string | null;
          recipient_user_id?: string;
          title?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_recipient_user_id_fkey";
            columns: ["recipient_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_invites: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          branch_ids: string[];
          code: string;
          created_at: string;
          created_by: string;
          expires_at: string;
          id: string;
          organization_id: string;
          role: Database["public"]["Enums"]["member_role"];
          staff_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          branch_ids: string[];
          code?: string;
          created_at?: string;
          created_by: string;
          expires_at: string;
          id?: string;
          organization_id: string;
          role: Database["public"]["Enums"]["member_role"];
          staff_id?: string | null;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          branch_ids?: string[];
          code?: string;
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          id?: string;
          organization_id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          staff_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organization_invites_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_invites_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_invites_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_invites_staff_id_organization_id_fkey";
            columns: ["staff_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      organization_members: {
        Row: {
          can_review_deposits: boolean;
          created_at: string;
          id: string;
          is_active: boolean;
          organization_id: string;
          role: Database["public"]["Enums"]["member_role"];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          can_review_deposits?: boolean;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          organization_id: string;
          role: Database["public"]["Enums"]["member_role"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          can_review_deposits?: boolean;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          organization_id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          access_status: Database["public"]["Enums"]["org_access_status"];
          booking_horizon_days: number;
          cancellation_policy: string | null;
          category: Database["public"]["Enums"]["org_category"];
          created_at: string;
          deposit_fixed_amount: number | null;
          deposit_percent: number | null;
          deposit_type: Database["public"]["Enums"]["deposit_type"];
          hold_minutes: number;
          id: string;
          is_listed: boolean;
          logo_path: string | null;
          min_notice_minutes: number;
          name: string;
          restricted_at: string | null;
          restriction_reason: Database["public"]["Enums"]["org_restriction_reason"] | null;
          review_hours: number;
          slot_interval_minutes: number;
          slug: string;
          terms_accepted_at: string | null;
          terms_accepted_by: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          access_status?: Database["public"]["Enums"]["org_access_status"];
          booking_horizon_days?: number;
          cancellation_policy?: string | null;
          category: Database["public"]["Enums"]["org_category"];
          created_at?: string;
          deposit_fixed_amount?: number | null;
          deposit_percent?: number | null;
          deposit_type?: Database["public"]["Enums"]["deposit_type"];
          hold_minutes?: number;
          id?: string;
          is_listed?: boolean;
          logo_path?: string | null;
          min_notice_minutes?: number;
          name: string;
          restricted_at?: string | null;
          restriction_reason?: Database["public"]["Enums"]["org_restriction_reason"] | null;
          review_hours?: number;
          slot_interval_minutes?: number;
          slug: string;
          terms_accepted_at?: string | null;
          terms_accepted_by?: string | null;
          updated_at?: string;
        };
        Update: {
          access_status?: Database["public"]["Enums"]["org_access_status"];
          booking_horizon_days?: number;
          cancellation_policy?: string | null;
          category?: Database["public"]["Enums"]["org_category"];
          created_at?: string;
          deposit_fixed_amount?: number | null;
          deposit_percent?: number | null;
          deposit_type?: Database["public"]["Enums"]["deposit_type"];
          hold_minutes?: number;
          id?: string;
          is_listed?: boolean;
          logo_path?: string | null;
          min_notice_minutes?: number;
          name?: string;
          restricted_at?: string | null;
          restriction_reason?: Database["public"]["Enums"]["org_restriction_reason"] | null;
          review_hours?: number;
          slot_interval_minutes?: number;
          slug?: string;
          terms_accepted_at?: string | null;
          terms_accepted_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organizations_terms_accepted_by_fkey";
            columns: ["terms_accepted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_proofs: {
        Row: {
          amount_paid: number;
          booking_id: string;
          branch_id: string;
          created_at: string;
          id: string;
          method: Database["public"]["Enums"]["payment_method"];
          note: string | null;
          organization_id: string;
          proof_path: string | null;
          reference_number: string;
          review_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["proof_status"];
          submitted_by: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount_paid: number;
          booking_id: string;
          branch_id: string;
          created_at?: string;
          id?: string;
          method: Database["public"]["Enums"]["payment_method"];
          note?: string | null;
          organization_id: string;
          proof_path?: string | null;
          reference_number: string;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["proof_status"];
          submitted_by: string;
          updated_at?: string;
        };
        Update: {
          amount_paid?: number;
          booking_id?: string;
          branch_id?: string;
          created_at?: string;
          id?: string;
          method?: Database["public"]["Enums"]["payment_method"];
          note?: string | null;
          organization_id?: string;
          proof_path?: string | null;
          reference_number?: string;
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["proof_status"];
          submitted_by?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_proofs_booking_id_organization_id_fkey";
            columns: ["booking_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "payment_proofs_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branch_setup_status";
            referencedColumns: ["branch_id", "organization_id"];
          },
          {
            foreignKeyName: "payment_proofs_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "payment_proofs_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "my_branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "payment_proofs_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "public_branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "payment_proofs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_proofs_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_proofs_submitted_by_fkey";
            columns: ["submitted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_admins: {
        Row: {
          created_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      platform_settings: {
        Row: {
          created_at: string;
          cutoff_schedule: Database["public"]["Enums"]["cutoff_schedule"];
          cutoff_weekday: number | null;
          fee_maximum: number;
          fee_minimum: number;
          fee_percent: number;
          grace_period_days: number;
          id: boolean;
          payment_instructions: NonNullable<Json>;
          statement_minimum: number;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          cutoff_schedule?: Database["public"]["Enums"]["cutoff_schedule"];
          cutoff_weekday?: number | null;
          fee_maximum?: number;
          fee_minimum?: number;
          fee_percent?: number;
          grace_period_days?: number;
          id?: boolean;
          payment_instructions?: NonNullable<Json>;
          statement_minimum?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          cutoff_schedule?: Database["public"]["Enums"]["cutoff_schedule"];
          cutoff_weekday?: number | null;
          fee_maximum?: number;
          fee_minimum?: number;
          fee_percent?: number;
          grace_period_days?: number;
          id?: boolean;
          payment_instructions?: NonNullable<Json>;
          statement_minimum?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_path: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          is_guest: boolean;
          mobile_number: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_path?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          is_guest?: boolean;
          mobile_number?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_path?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          is_guest?: boolean;
          mobile_number?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      sale_items: {
        Row: {
          amount: number;
          commission_amount: number;
          commission_percent: number;
          description: string;
          discount_share: number;
          id: string;
          organization_id: string;
          sale_id: string;
          service_id: string | null;
          sort_order: number;
          staff_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          commission_amount: number;
          commission_percent: number;
          description: string;
          discount_share?: number;
          id?: string;
          organization_id: string;
          sale_id: string;
          service_id?: string | null;
          sort_order: number;
          staff_id: string;
        };
        Update: {
          amount?: number;
          commission_amount?: number;
          commission_percent?: number;
          description?: string;
          discount_share?: number;
          id?: string;
          organization_id?: string;
          sale_id?: string;
          service_id?: string | null;
          sort_order?: number;
          staff_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sale_items_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_items_sale_id_organization_id_fkey";
            columns: ["sale_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "sale_items_service_id_organization_id_fkey";
            columns: ["service_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "sale_items_staff_id_organization_id_fkey";
            columns: ["staff_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      sale_payments: {
        Row: {
          amount: number;
          id: string;
          method: Database["public"]["Enums"]["payment_method"];
          organization_id: string;
          reference: string | null;
          sale_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          id?: string;
          method: Database["public"]["Enums"]["payment_method"];
          organization_id: string;
          reference?: string | null;
          sale_id: string;
        };
        Update: {
          amount?: number;
          id?: string;
          method?: Database["public"]["Enums"]["payment_method"];
          organization_id?: string;
          reference?: string | null;
          sale_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sale_payments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_payments_sale_id_organization_id_fkey";
            columns: ["sale_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      sale_tips: {
        Row: {
          amount: number;
          organization_id: string;
          sale_id: string;
          staff_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          organization_id: string;
          sale_id: string;
          staff_id: string;
        };
        Update: {
          amount?: number;
          organization_id?: string;
          sale_id?: string;
          staff_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sale_tips_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_tips_sale_id_organization_id_fkey";
            columns: ["sale_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "sale_tips_staff_id_organization_id_fkey";
            columns: ["staff_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      sales: {
        Row: {
          balance_collected: number;
          booking_id: string;
          branch_id: string;
          business_date: string;
          client_id: string;
          completed_at: string;
          completed_by: string;
          created_at: string;
          deposit_applied: number;
          discount_amount: number;
          id: string;
          organization_id: string;
          subtotal: number;
          tip_amount: number;
        };
        ComputedFields: never;
        Insert: {
          balance_collected: number;
          booking_id: string;
          branch_id: string;
          business_date: string;
          client_id: string;
          completed_at?: string;
          completed_by: string;
          created_at?: string;
          deposit_applied?: number;
          discount_amount?: number;
          id?: string;
          organization_id: string;
          subtotal: number;
          tip_amount?: number;
        };
        Update: {
          balance_collected?: number;
          booking_id?: string;
          branch_id?: string;
          business_date?: string;
          client_id?: string;
          completed_at?: string;
          completed_by?: string;
          created_at?: string;
          deposit_applied?: number;
          discount_amount?: number;
          id?: string;
          organization_id?: string;
          subtotal?: number;
          tip_amount?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sales_booking_id_organization_id_fkey";
            columns: ["booking_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "sales_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branch_setup_status";
            referencedColumns: ["branch_id", "organization_id"];
          },
          {
            foreignKeyName: "sales_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "sales_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "my_branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "sales_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "public_branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "sales_client_id_organization_id_fkey";
            columns: ["client_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "sales_completed_by_fkey";
            columns: ["completed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      service_categories: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          organization_id: string;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          organization_id: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          organization_id?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_categories_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          buffer_minutes: number;
          category_id: string;
          created_at: string;
          deposit_fixed_amount: number | null;
          deposit_percent: number | null;
          deposit_type: Database["public"]["Enums"]["deposit_type"] | null;
          description: string | null;
          duration_minutes: number;
          id: string;
          is_active: boolean;
          name: string;
          organization_id: string;
          price: number;
          price_is_starting: boolean;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          buffer_minutes?: number;
          category_id: string;
          created_at?: string;
          deposit_fixed_amount?: number | null;
          deposit_percent?: number | null;
          deposit_type?: Database["public"]["Enums"]["deposit_type"] | null;
          description?: string | null;
          duration_minutes: number;
          id?: string;
          is_active?: boolean;
          name: string;
          organization_id: string;
          price: number;
          price_is_starting?: boolean;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          buffer_minutes?: number;
          category_id?: string;
          created_at?: string;
          deposit_fixed_amount?: number | null;
          deposit_percent?: number | null;
          deposit_type?: Database["public"]["Enums"]["deposit_type"] | null;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          is_active?: boolean;
          name?: string;
          organization_id?: string;
          price?: number;
          price_is_starting?: boolean;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "services_category_id_organization_id_fkey";
            columns: ["category_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "service_categories";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "services_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      staff: {
        Row: {
          commission_percent: number;
          created_at: string;
          display_name: string;
          id: string;
          is_active: boolean;
          is_bookable: boolean;
          member_id: string | null;
          organization_id: string;
          photo_path: string | null;
          title: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          commission_percent?: number;
          created_at?: string;
          display_name: string;
          id?: string;
          is_active?: boolean;
          is_bookable?: boolean;
          member_id?: string | null;
          organization_id: string;
          photo_path?: string | null;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          commission_percent?: number;
          created_at?: string;
          display_name?: string;
          id?: string;
          is_active?: boolean;
          is_bookable?: boolean;
          member_id?: string | null;
          organization_id?: string;
          photo_path?: string | null;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_member_id_organization_id_fkey";
            columns: ["member_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "my_memberships";
            referencedColumns: ["member_id", "organization_id"];
          },
          {
            foreignKeyName: "staff_member_id_organization_id_fkey";
            columns: ["member_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_members";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "staff_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_branches: {
        Row: {
          branch_id: string;
          created_at: string;
          organization_id: string;
          staff_id: string;
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          created_at?: string;
          organization_id: string;
          staff_id: string;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          organization_id?: string;
          staff_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_branches_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branch_setup_status";
            referencedColumns: ["branch_id", "organization_id"];
          },
          {
            foreignKeyName: "staff_branches_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "staff_branches_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "my_branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "staff_branches_branch_id_organization_id_fkey";
            columns: ["branch_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "public_branches";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "staff_branches_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_branches_staff_id_organization_id_fkey";
            columns: ["staff_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      staff_services: {
        Row: {
          commission_percent_override: number | null;
          created_at: string;
          organization_id: string;
          service_id: string;
          staff_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          commission_percent_override?: number | null;
          created_at?: string;
          organization_id: string;
          service_id: string;
          staff_id: string;
          updated_at?: string;
        };
        Update: {
          commission_percent_override?: number | null;
          created_at?: string;
          organization_id?: string;
          service_id?: string;
          staff_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_services_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_services_service_id_organization_id_fkey";
            columns: ["service_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "staff_services_staff_id_organization_id_fkey";
            columns: ["staff_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      staff_shifts: {
        Row: {
          branch_id: string;
          created_at: string;
          day_of_week: number;
          ends_at: string;
          ends_next_day: boolean;
          id: string;
          organization_id: string;
          staff_id: string;
          starts_at: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          created_at?: string;
          day_of_week: number;
          ends_at: string;
          ends_next_day?: boolean;
          id?: string;
          organization_id: string;
          staff_id: string;
          starts_at: string;
          updated_at?: string;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          day_of_week?: number;
          ends_at?: string;
          ends_next_day?: boolean;
          id?: string;
          organization_id?: string;
          staff_id?: string;
          starts_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_shifts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_shifts_staff_id_branch_id_fkey";
            columns: ["staff_id", "branch_id"];
            isOneToOne: false;
            referencedRelation: "staff_branches";
            referencedColumns: ["staff_id", "branch_id"];
          },
          {
            foreignKeyName: "staff_shifts_staff_id_organization_id_fkey";
            columns: ["staff_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      staff_time_off: {
        Row: {
          created_at: string;
          ends_at: string;
          id: string;
          organization_id: string;
          reason: string | null;
          staff_id: string;
          starts_at: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          ends_at: string;
          id?: string;
          organization_id: string;
          reason?: string | null;
          staff_id: string;
          starts_at: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          ends_at?: string;
          id?: string;
          organization_id?: string;
          reason?: string | null;
          staff_id?: string;
          starts_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_time_off_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_time_off_staff_id_organization_id_fkey";
            columns: ["staff_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
    };
    Views: {
      branch_setup_status: {
        Row: {
          bookable_staff_with_shift_count: number | null;
          branch_id: string;
          has_location: boolean | null;
          has_payment_details: boolean | null;
          is_published: boolean;
          offered_service_count: number | null;
          open_day_count: number | null;
          organization_id: string;
          terms_accepted: boolean | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "branches_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      my_branches: {
        Row: {
          business_day_start: string;
          current_business_date: string | null;
          id: string;
          name: string;
          organization_id: string;
          slug: string;
          timezone: string;
        };
        ComputedFields: never;
        Insert: {
          business_day_start?: string | null;
          current_business_date?: never;
          id?: string | null;
          name?: string | null;
          organization_id?: string | null;
          slug?: string | null;
          timezone?: string | null;
        };
        Update: {
          business_day_start?: string | null;
          current_business_date?: never;
          id?: string | null;
          name?: string | null;
          organization_id?: string | null;
          slug?: string | null;
          timezone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "branches_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      my_memberships: {
        Row: {
          access_status: Database["public"]["Enums"]["org_access_status"];
          can_review_deposits: boolean;
          member_id: string;
          organization_id: string;
          organization_name: string;
          organization_slug: string;
          role: Database["public"]["Enums"]["member_role"];
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      public_branch_services: {
        Row: {
          branch_id: string;
          category_id: string;
          category_name: string;
          category_sort_order: number;
          description: string | null;
          duration_minutes: number;
          name: string;
          price: number | null;
          price_is_starting: boolean;
          service_id: string;
          sort_order: number;
        };
        ComputedFields: never;
        Relationships: [];
      };
      public_branch_staff: {
        Row: {
          branch_id: string;
          display_name: string;
          photo_path: string | null;
          service_ids: string[] | null;
          staff_id: string;
          title: string | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      public_branches: {
        Row: {
          address: string | null;
          area: string | null;
          booking_horizon_days: number;
          business_day_start: string;
          cancellation_policy: string | null;
          city: string | null;
          contact_number: string | null;
          current_business_date: string | null;
          hold_minutes: number;
          hours: Json | null;
          id: string;
          name: string;
          organization_id: string;
          organization_logo_path: string | null;
          organization_name: string;
          organization_slug: string;
          photo_paths: Json | null;
          slug: string;
          timezone: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "branches_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      accept_invite: { Args: { p_code: string }; Returns: string };
      accept_terms: { Args: { p_organization_id: string }; Returns: undefined };
      add_walk_in: {
        Args: {
          p_branch_id: string;
          p_client_id?: string;
          p_client_name?: string;
          p_client_note?: string;
          p_mobile_number?: string;
          p_service_ids: string[];
          p_staff_id?: string;
        };
        Returns: string;
      };
      cancel_booking: { Args: { p_booking_id: string; p_reason?: string }; Returns: undefined };
      check_in_booking: { Args: { p_booking_id: string }; Returns: undefined };
      claim_guest_booking: { Args: { p_booking_code: string }; Returns: string };
      close_day: {
        Args: {
          p_branch_id: string;
          p_business_date: string;
          p_cash_counted: number;
          p_cash_float: number;
        };
        Returns: string;
      };
      complete_checkout: {
        Args: {
          p_booking_id: string;
          p_discount_amount: number;
          p_items: Json;
          p_payments: Json;
          p_tips: Json;
        };
        Returns: string;
      };
      create_branch: {
        Args: {
          p_address: string;
          p_area: string;
          p_branch_name: string;
          p_city: string;
          p_hours: Json;
          p_organization_id: string;
        };
        Returns: string;
      };
      create_invite: {
        Args: {
          p_branch_ids: string[];
          p_organization_id: string;
          p_role: Database["public"]["Enums"]["member_role"];
          p_staff_id?: string;
        };
        Returns: {
          code: string;
          expires_at: string;
          invite_id: string;
        }[];
      };
      create_online_booking: {
        Args: {
          p_branch_id: string;
          p_client_name: string;
          p_client_note?: string;
          p_mobile_number: string;
          p_privacy_notice_version: string;
          p_service_ids: string[];
          p_staff_id?: string;
          p_start_at: string;
        };
        Returns: {
          booking_code: string;
          booking_id: string;
        }[];
      };
      create_organization: {
        Args: {
          p_address: string;
          p_area: string;
          p_branch_name: string;
          p_category: Database["public"]["Enums"]["org_category"];
          p_city: string;
          p_hours: Json;
          p_organization_name: string;
        };
        Returns: {
          branch_id: string;
          organization_id: string;
        }[];
      };
      create_staff_booking: {
        Args: {
          p_branch_id: string;
          p_client_id?: string;
          p_client_name?: string;
          p_client_note?: string;
          p_mobile_number?: string;
          p_service_ids: string[];
          p_staff_id: string;
          p_start_at: string;
        };
        Returns: string;
      };
      get_available_slots: {
        Args: {
          p_branch_id: string;
          p_business_date: string;
          p_service_ids: string[];
          p_staff_id?: string;
        };
        Returns: {
          start_at: string;
        }[];
      };
      get_booking_by_code: {
        Args: { p_booking_code: string };
        Returns: {
          amount_due: number;
          booked_at: string;
          booked_by_guest: boolean;
          booking_code: string;
          booking_id: string;
          branch_address: string;
          branch_area: string;
          branch_city: string;
          branch_contact_number: string;
          branch_name: string;
          branch_slug: string;
          branch_timezone: string;
          cancelled_by: string;
          client_name: string;
          client_note: string;
          convenience_fee: number;
          deposit_amount: number;
          hold_expires_at: string;
          latest_proof_amount_paid: number;
          latest_proof_method: Database["public"]["Enums"]["payment_method"];
          latest_proof_reference_number: string;
          latest_proof_review_note: string;
          latest_proof_status: Database["public"]["Enums"]["proof_status"];
          organization_id: string;
          organization_name: string;
          payment_instructions: Json;
          policy_acceptance: Json;
          review_expires_at: string;
          service_total: number;
          services: Json;
          services_end_at: string;
          staff_display_name: string;
          start_at: string;
          status: Database["public"]["Enums"]["booking_status"];
          viewer_is_creator: boolean;
          viewer_is_member: boolean;
        }[];
      };
      get_booking_quote: {
        Args: { p_branch_id: string; p_service_ids: string[] };
        Returns: {
          amount_due: number;
          convenience_fee: number;
          deposit_amount: number;
          service_total: number;
        }[];
      };
      get_client_notes: { Args: { p_client_id: string }; Returns: string };
      get_daily_close_summary: {
        Args: { p_branch_id: string; p_business_date: string };
        Returns: {
          cash_counted: number;
          cash_expected: number;
          cash_float: number;
          cash_sales: number;
          cash_variance: number;
          closed_at: string;
          deposits_applied: number;
          deposits_received: number;
          discounts: number;
          fees_collected: number;
          gross_sales: number;
          is_closed: boolean;
          reopened_at: string;
          sale_count: number;
          staff: Json;
          tips: number;
          totals_by_method: Json;
          unfinished_visit_count: number;
        }[];
      };
      get_invite_preview: {
        Args: { p_code: string };
        Returns: {
          branch_names: string[];
          expires_at: string;
          organization_name: string;
          role: Database["public"]["Enums"]["member_role"];
        }[];
      };
      get_next_available_date: {
        Args: {
          p_after_date: string;
          p_branch_id: string;
          p_service_ids: string[];
          p_staff_id?: string;
        };
        Returns: string;
      };
      mark_no_show: { Args: { p_booking_id: string }; Returns: undefined };
      merge_clients: {
        Args: { p_duplicate_client_id: string; p_keep_client_id: string };
        Returns: undefined;
      };
      record_refund_outcome: {
        Args: { p_amount: number; p_booking_id: string; p_note?: string; p_refunded: boolean };
        Returns: undefined;
      };
      remove_member: { Args: { p_member_id: string }; Returns: undefined };
      reopen_day: { Args: { p_branch_id: string; p_business_date: string }; Returns: undefined };
      reschedule_booking: {
        Args: { p_booking_id: string; p_staff_id: string; p_start_at: string };
        Returns: undefined;
      };
      review_payment_proof: {
        Args: {
          p_outcome: Database["public"]["Enums"]["proof_status"];
          p_proof_id: string;
          p_review_note?: string;
        };
        Returns: undefined;
      };
      save_staff_profile: {
        Args: {
          p_branch_ids: string[];
          p_commission_percent: number;
          p_display_name: string;
          p_is_active: boolean;
          p_is_bookable: boolean;
          p_member_id?: string;
          p_organization_id: string;
          p_photo_path?: string;
          p_services: Json;
          p_staff_id?: string;
          p_title?: string;
        };
        Returns: string;
      };
      search_clients: {
        Args: { p_branch_id: string; p_limit?: number; p_offset?: number; p_query: string };
        Returns: {
          full_name: string;
          id: string;
          mobile_number: string;
        }[];
      };
      set_branch_hours: { Args: { p_branch_id: string; p_hours: Json }; Returns: undefined };
      start_service: { Args: { p_booking_id: string; p_staff_id?: string }; Returns: undefined };
      submit_payment_proof: {
        Args: {
          p_amount_paid: number;
          p_booking_id: string;
          p_method: Database["public"]["Enums"]["payment_method"];
          p_note?: string;
          p_proof_path?: string;
          p_reference_number: string;
        };
        Returns: string;
      };
      update_member: {
        Args: {
          p_branch_ids: string[];
          p_can_review_deposits: boolean;
          p_member_id: string;
          p_role: Database["public"]["Enums"]["member_role"];
        };
        Returns: undefined;
      };
    };
    Enums: {
      booking_source: "online" | "staff" | "walk_in";
      booking_status:
        | "held"
        | "payment_submitted"
        | "needs_resubmission"
        | "review_expired_pending_resolution"
        | "confirmed"
        | "waiting"
        | "checked_in"
        | "in_service"
        | "completed"
        | "cancelled"
        | "no_show"
        | "hold_expired"
        | "payment_rejected";
      cutoff_schedule: "weekly" | "semi_monthly" | "monthly";
      deposit_type: "fixed" | "percent";
      fee_entry_kind: "booking_fee" | "adjustment";
      member_role: "owner" | "manager" | "staff";
      org_access_status: "active" | "restricted";
      org_category: "salon" | "barbershop" | "spa" | "nails" | "lashes_brows" | "other";
      org_restriction_reason: "overdue_statement" | "manual";
      payment_method: "cash" | "gcash" | "maya" | "card" | "bank_transfer" | "other";
      proof_status: "submitted" | "accepted" | "rejected" | "resubmission_requested" | "withdrawn";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      booking_source: ["online", "staff", "walk_in"],
      booking_status: [
        "held",
        "payment_submitted",
        "needs_resubmission",
        "review_expired_pending_resolution",
        "confirmed",
        "waiting",
        "checked_in",
        "in_service",
        "completed",
        "cancelled",
        "no_show",
        "hold_expired",
        "payment_rejected",
      ],
      cutoff_schedule: ["weekly", "semi_monthly", "monthly"],
      deposit_type: ["fixed", "percent"],
      fee_entry_kind: ["booking_fee", "adjustment"],
      member_role: ["owner", "manager", "staff"],
      org_access_status: ["active", "restricted"],
      org_category: ["salon", "barbershop", "spa", "nails", "lashes_brows", "other"],
      org_restriction_reason: ["overdue_statement", "manual"],
      payment_method: ["cash", "gcash", "maya", "card", "bank_transfer", "other"],
      proof_status: ["submitted", "accepted", "rejected", "resubmission_requested", "withdrawn"],
    },
  },
} as const;
