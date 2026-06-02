export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      analytics_events: {
        Row: {
          created_at: string
          event_type: Database["public"]["Enums"]["analytics_event_type"]
          id: number
          payload: Json
          product_id: string | null
          session_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          event_type: Database["public"]["Enums"]["analytics_event_type"]
          id?: number
          payload?: Json
          product_id?: string | null
          session_id?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          event_type?: Database["public"]["Enums"]["analytics_event_type"]
          id?: number
          payload?: Json
          product_id?: string | null
          session_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          created_at: string
          diff: Json
          id: string
          ip: unknown | null
          target_id: string | null
          target_table: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          diff?: Json
          id?: string
          ip?: unknown | null
          target_id?: string | null
          target_table?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          diff?: Json
          id?: string
          ip?: unknown | null
          target_id?: string | null
          target_table?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          cover_image_url: string | null
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_verification_attempts: {
        Row: {
          attempted_at: string
          domain_id: string
          error: string | null
          expected: string | null
          found: string | null
          id: string
          record_type: string
          success: boolean
        }
        Insert: {
          attempted_at?: string
          domain_id: string
          error?: string | null
          expected?: string | null
          found?: string | null
          id?: string
          record_type: string
          success?: boolean
        }
        Update: {
          attempted_at?: string
          domain_id?: string
          error?: string | null
          expected?: string | null
          found?: string | null
          id?: string
          record_type?: string
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "domain_verification_attempts_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
        ]
      }
      domains: {
        Row: {
          created_at: string
          host: string
          id: string
          kind: Database["public"]["Enums"]["domain_kind"]
          status: Database["public"]["Enums"]["domain_status"]
          tenant_id: string
          verification_token: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          host: string
          id?: string
          kind: Database["public"]["Enums"]["domain_kind"]
          status?: Database["public"]["Enums"]["domain_status"]
          tenant_id: string
          verification_token?: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          host?: string
          id?: string
          kind?: Database["public"]["Enums"]["domain_kind"]
          status?: Database["public"]["Enums"]["domain_status"]
          tenant_id?: string
          verification_token?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "domains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          payload: Json
          sent_at: string | null
          status: Database["public"]["Enums"]["email_status"]
          template: string
          to_email: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          payload?: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          template: string
          to_email: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          payload?: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status"]
          template?: string
          to_email?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body_html: string
          body_text: string | null
          created_at: string
          description: string | null
          key: string
          subject: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body_html: string
          body_text?: string | null
          created_at?: string
          description?: string | null
          key: string
          subject: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body_html?: string
          body_text?: string | null
          created_at?: string
          description?: string | null
          key?: string
          subject?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      error_reports: {
        Row: {
          created_at: string
          id: string
          message: string
          meta: Json
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          route: string | null
          scope: Database["public"]["Enums"]["error_scope"]
          stack: string | null
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          meta?: Json
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          route?: string | null
          scope: Database["public"]["Enums"]["error_scope"]
          stack?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          meta?: Json
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          route?: string | null
          scope?: Database["public"]["Enums"]["error_scope"]
          stack?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string | null
          enabled: boolean
          key: string
          rollout_percent: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          key: string
          rollout_percent?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          enabled?: boolean
          key?: string
          rollout_percent?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      fx_rates: {
        Row: {
          base_currency: string
          created_at: string
          effective_at: string
          id: string
          quote_currency: string
          rate: number
        }
        Insert: {
          base_currency?: string
          created_at?: string
          effective_at?: string
          id?: string
          quote_currency?: string
          rate: number
        }
        Update: {
          base_currency?: string
          created_at?: string
          effective_at?: string
          id?: string
          quote_currency?: string
          rate?: number
        }
        Relationships: []
      }
      orders: {
        Row: {
          created_at: string
          currency: string
          customer_address: string | null
          customer_name: string
          customer_phone: string
          id: string
          items: Json
          notes: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_address?: string | null
          customer_name: string
          customer_phone: string
          id?: string
          items?: Json
          notes?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          customer_address?: string | null
          customer_name?: string
          customer_phone?: string
          id?: string
          items?: Json
          notes?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          account_holder: string | null
          account_identifier: string
          created_at: string
          id: string
          instructions: string | null
          is_active: boolean
          kind: Database["public"]["Enums"]["payment_method_kind"]
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          account_holder?: string | null
          account_identifier: string
          created_at?: string
          id?: string
          instructions?: string | null
          is_active?: boolean
          kind: Database["public"]["Enums"]["payment_method_kind"]
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          account_holder?: string | null
          account_identifier?: string
          created_at?: string
          id?: string
          instructions?: string | null
          is_active?: boolean
          kind?: Database["public"]["Enums"]["payment_method_kind"]
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      payment_proofs: {
        Row: {
          amount_egp: number | null
          amount_usd: number
          created_at: string
          fx_rate: number | null
          id: string
          notes: string | null
          payment_method_id: string
          reference_number: string
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_notes: string | null
          screenshot_path: string | null
          status: Database["public"]["Enums"]["payment_proof_status"]
          subscription_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_egp?: number | null
          amount_usd: number
          created_at?: string
          fx_rate?: number | null
          id?: string
          notes?: string | null
          payment_method_id: string
          reference_number: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          screenshot_path?: string | null
          status?: Database["public"]["Enums"]["payment_proof_status"]
          subscription_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_egp?: number | null
          amount_usd?: number
          created_at?: string
          fx_rate?: number | null
          id?: string
          notes?: string | null
          payment_method_id?: string
          reference_number?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          screenshot_path?: string | null
          status?: Database["public"]["Enums"]["payment_proof_status"]
          subscription_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_proofs_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_proofs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_proofs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          description: string | null
          features: Json
          id: string
          interval: Database["public"]["Enums"]["plan_interval"]
          is_active: boolean
          name: string
          price_usd: number
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          interval?: Database["public"]["Enums"]["plan_interval"]
          is_active?: boolean
          name: string
          price_usd: number
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          interval?: Database["public"]["Enums"]["plan_interval"]
          is_active?: boolean
          name?: string
          price_usd?: number
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category_id: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price_cents: number
          sku: string | null
          sort_order: number
          stock: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price_cents?: number
          sku?: string | null
          sort_order?: number
          stock?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price_cents?: number
          sku?: string | null
          sort_order?: number
          stock?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          currency: string
          id: string
          period_end: string | null
          period_start: string | null
          plan_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          period_end?: string | null
          period_start?: string | null
          plan_id: string
          status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          period_end?: string | null
          period_start?: string | null
          plan_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          accent_color: string | null
          created_at: string
          currency: string
          id: string
          logo_url: string | null
          low_stock_threshold: number
          name: string
          niche: Database["public"]["Enums"]["tenant_niche"]
          og_image_url: string | null
          owner_id: string
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          theme: Json
          updated_at: string
          whatsapp_e164: string | null
        }
        Insert: {
          accent_color?: string | null
          created_at?: string
          currency?: string
          id?: string
          logo_url?: string | null
          low_stock_threshold?: number
          name: string
          niche?: Database["public"]["Enums"]["tenant_niche"]
          og_image_url?: string | null
          owner_id: string
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          theme?: Json
          updated_at?: string
          whatsapp_e164?: string | null
        }
        Update: {
          accent_color?: string | null
          created_at?: string
          currency?: string
          id?: string
          logo_url?: string | null
          low_stock_threshold?: number
          name?: string
          niche?: Database["public"]["Enums"]["tenant_niche"]
          og_image_url?: string | null
          owner_id?: string
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          theme?: Json
          updated_at?: string
          whatsapp_e164?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_webhook_events: {
        Row: {
          created_at: string
          error: string | null
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          signature: string | null
          tenant_id: string | null
          verified: boolean
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          provider: string
          signature?: string | null
          tenant_id?: string | null
          verified?: boolean
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          signature?: string | null
          tenant_id?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_webhook_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_tenant_owner: {
        Args: {
          _tenant_id: string
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      analytics_event_type:
        | "page_view"
        | "product_view"
        | "add_to_cart"
        | "checkout_start"
        | "order_placed"
      app_role: "admin" | "user"
      domain_kind: "subdomain" | "custom"
      domain_status: "pending" | "verified" | "failed"
      email_status: "queued" | "sent" | "failed"
      error_scope: "client" | "server"
      order_status:
        | "whatsapp_sent"
        | "confirmed"
        | "fulfilled"
        | "cancelled"
      payment_method_kind: "instapay" | "vodafone_cash" | "bank_transfer"
      payment_proof_status: "pending" | "approved" | "rejected"
      plan_interval: "monthly" | "yearly"
      subscription_status:
        | "pending_payment"
        | "active"
        | "expired"
        | "cancelled"
      tenant_niche: "retail" | "clinic" | "pharmacy"
      tenant_status: "pending" | "active" | "suspended"
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
      analytics_event_type: [
        "page_view",
        "product_view",
        "add_to_cart",
        "checkout_start",
        "order_placed",
      ],
      app_role: ["admin", "user"],
      domain_kind: ["subdomain", "custom"],
      domain_status: ["pending", "verified", "failed"],
      email_status: ["queued", "sent", "failed"],
      error_scope: ["client", "server"],
      order_status: ["whatsapp_sent", "confirmed", "fulfilled", "cancelled"],
      payment_method_kind: ["instapay", "vodafone_cash", "bank_transfer"],
      payment_proof_status: ["pending", "approved", "rejected"],
      plan_interval: ["monthly", "yearly"],
      subscription_status: [
        "pending_payment",
        "active",
        "expired",
        "cancelled",
      ],
      tenant_niche: ["retail", "clinic", "pharmacy"],
      tenant_status: ["pending", "active", "suspended"],
    },
  },
} as const
