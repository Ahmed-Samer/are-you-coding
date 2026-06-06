export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      abandoned_carts: {
        Row: {
          cart_id: string
          created_at: string
          email: string | null
          id: string
          items: Json
          last_active_at: string
          recovery_status: string
          tenant_id: string
          total_usd: number
        }
        Insert: {
          cart_id: string
          created_at?: string
          email?: string | null
          id?: string
          items?: Json
          last_active_at?: string
          recovery_status?: string
          tenant_id: string
          total_usd?: number
        }
        Update: {
          cart_id?: string
          created_at?: string
          email?: string | null
          id?: string
          items?: Json
          last_active_at?: string
          recovery_status?: string
          tenant_id?: string
          total_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_carts_tenant_id_fkey"
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
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          resource_id: string | null
          resource_type: string | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type?: string | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_throttle_events: {
        Row: {
          created_at: string
          id: string
          ip: string
          kind: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip: string
          kind: string
        }
        Update: {
          created_at?: string
          id?: string
          ip?: string
          kind?: string
        }
        Relationships: []
      }
      cart_sessions: {
        Row: {
          created_at: string
          currency: string
          expires_at: string
          id: string
          items: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          expires_at: string
          id?: string
          items?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          expires_at?: string
          id?: string
          items?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          slug: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          slug: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          slug?: string
          tenant_id?: string
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
      domains: {
        Row: {
          created_at: string
          domain: string
          id: string
          is_primary: boolean
          status: string
          tenant_id: string
          verification_errors: Json | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          is_primary?: boolean
          status?: string
          tenant_id: string
          verification_errors?: Json | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          is_primary?: boolean
          status?: string
          tenant_id?: string
          verification_errors?: Json | null
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
      error_logs: {
        Row: {
          browser: string | null
          component_stack: string | null
          created_at: string | null
          error_message: string
          error_stack: string | null
          id: string
          metadata: Json | null
          os: string | null
          tenant_id: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          browser?: string | null
          component_stack?: string | null
          created_at?: string | null
          error_message: string
          error_stack?: string | null
          id?: string
          metadata?: Json | null
          os?: string | null
          tenant_id?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          browser?: string | null
          component_stack?: string | null
          created_at?: string | null
          error_message?: string
          error_stack?: string | null
          id?: string
          metadata?: Json | null
          os?: string | null
          tenant_id?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          enabled_for_tenants: string[] | null
          is_enabled: boolean
          key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled_for_tenants?: string[] | null
          is_enabled?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled_for_tenants?: string[] | null
          is_enabled?: boolean
          key?: string
          updated_at?: string
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
      leads: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string | null
          phone: string | null
          source: string | null
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name?: string | null
          phone?: string | null
          source?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          phone?: string | null
          source?: string | null
          status?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          price_at_time: number
          product_id: string
          quantity: number
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          price_at_time: number
          product_id: string
          quantity?: number
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          price_at_time?: number
          product_id?: string
          quantity?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          customer_email: string | null
          customer_name: string | null
          id: string
          status: string
          tenant_id: string
          total_amount: number
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          status?: string
          tenant_id: string
          total_amount?: number
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          status?: string
          tenant_id?: string
          total_amount?: number
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
          is_active: boolean | null
          kind: string
          label: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          account_holder?: string | null
          account_identifier: string
          created_at?: string
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          kind?: string
          label: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          account_holder?: string | null
          account_identifier?: string
          created_at?: string
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          kind?: string
          label?: string
          sort_order?: number | null
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
          payment_method_id: string | null
          reference_number: string
          screenshot_path: string | null
          status: string | null
          subscription_id: string | null
          tenant_id: string | null
        }
        Insert: {
          amount_egp?: number | null
          amount_usd: number
          created_at?: string
          fx_rate?: number | null
          id?: string
          notes?: string | null
          payment_method_id?: string | null
          reference_number: string
          screenshot_path?: string | null
          status?: string | null
          subscription_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          amount_egp?: number | null
          amount_usd?: number
          created_at?: string
          fx_rate?: number | null
          id?: string
          notes?: string | null
          payment_method_id?: string | null
          reference_number?: string
          screenshot_path?: string | null
          status?: string | null
          subscription_id?: string | null
          tenant_id?: string | null
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
          currency: string
          description: string | null
          features: Json | null
          highlight: boolean
          id: string
          interval: Database["public"]["Enums"]["plan_interval"]
          is_active: boolean
          name: string
          price_usd: number
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json | null
          highlight?: boolean
          id?: string
          interval?: Database["public"]["Enums"]["plan_interval"]
          is_active?: boolean
          name: string
          price_usd: number
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json | null
          highlight?: boolean
          id?: string
          interval?: Database["public"]["Enums"]["plan_interval"]
          is_active?: boolean
          name?: string
          price_usd?: number
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          inventory_count: number | null
          options: Json
          price_adjustment: number | null
          product_id: string
          sku: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          inventory_count?: number | null
          options?: Json
          price_adjustment?: number | null
          product_id: string
          sku?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          inventory_count?: number | null
          options?: Json
          price_adjustment?: number | null
          product_id?: string
          sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_price: number
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          inventory_count: number | null
          is_active: boolean | null
          name: string
          sku: string | null
          slug: string
          tenant_id: string
        }
        Insert: {
          base_price?: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          inventory_count?: number | null
          is_active?: boolean | null
          name: string
          sku?: string | null
          slug: string
          tenant_id: string
        }
        Update: {
          base_price?: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          inventory_count?: number | null
          is_active?: boolean | null
          name?: string
          sku?: string | null
          slug?: string
          tenant_id?: string
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
      promotions: {
        Row: {
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          is_active: boolean
          starts_at: string
          tenant_id: string
          usage_count: number
          usage_limit: number | null
        }
        Insert: {
          code: string
          created_at?: string
          discount_type: string
          discount_value: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          starts_at?: string
          tenant_id: string
          usage_count?: number
          usage_limit?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          starts_at?: string
          tenant_id?: string
          usage_count?: number
          usage_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "promotions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          currency: string
          id: string
          instructions_email_sent_at: string | null
          period_end: string | null
          period_start: string | null
          plan_id: string
          price_usd_snapshot: number | null
          reference_code: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          instructions_email_sent_at?: string | null
          period_end?: string | null
          period_start?: string | null
          plan_id: string
          price_usd_snapshot?: number | null
          reference_code?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          instructions_email_sent_at?: string | null
          period_end?: string | null
          period_start?: string | null
          plan_id?: string
          price_usd_snapshot?: number | null
          reference_code?: string | null
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
      team_invites: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          inviter_id: string
          role: string
          tenant_id: string
          token: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          inviter_id: string
          role: string
          tenant_id: string
          token?: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          inviter_id?: string
          role?: string
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string | null
          name: string
          niche: Database["public"]["Enums"]["tenant_niche"]
          owner_id: string
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          template: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key?: string | null
          name: string
          niche?: Database["public"]["Enums"]["tenant_niche"]
          owner_id: string
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          template?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string | null
          name?: string
          niche?: Database["public"]["Enums"]["tenant_niche"]
          owner_id?: string
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          template?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          created_at: string
          endpoint_id: string
          error_message: string | null
          event_type: string
          id: string
          payload: Json
          response_body: string | null
          response_status: number | null
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          endpoint_id: string
          error_message?: string | null
          event_type: string
          id?: string
          payload: Json
          response_body?: string | null
          response_status?: number | null
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          endpoint_id?: string
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          created_at: string
          events: string[]
          id: string
          is_active: boolean | null
          secret: string
          tenant_id: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          events?: string[]
          id?: string
          is_active?: boolean | null
          secret: string
          tenant_id: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          events?: string[]
          id?: string
          is_active?: boolean | null
          secret?: string
          tenant_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_tenant_id_fkey"
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
      check_abandoned_carts: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      generate_reference_code: {
        Args: {
          id: string
        }
        Returns: string
      }
      get_dashboard_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          new_mrr_cents: number
          active_tenants: number
          pending_proofs: number
          error_rate: number
        }[]
      }
    }
    Enums: {
      plan_interval: "monthly" | "quarterly" | "yearly"
      subscription_status:
        | "pending_payment"
        | "active"
        | "expired"
        | "cancelled"
        | "pending_review"
      tenant_niche:
        | "retail"
        | "clinic"
        | "pharmacy"
        | "hardware"
        | "airsoft"
        | "fashion"
        | "electronics"
        | "beauty"
      tenant_status: "active" | "inactive" | "suspended" 
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never