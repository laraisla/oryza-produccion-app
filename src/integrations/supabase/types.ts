export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      whatsapp_acciones: {
        Row: {
          created_at: string
          datos: Json
          estado: string
          id: string
          resuelta_at: string | null
          resumen: string
          telefono: string
          tipo: string
        }
        Insert: {
          created_at?: string
          datos: Json
          estado?: string
          id?: string
          resuelta_at?: string | null
          resumen: string
          telefono: string
          tipo: string
        }
        Update: {
          created_at?: string
          datos?: Json
          estado?: string
          id?: string
          resuelta_at?: string | null
          resumen?: string
          telefono?: string
          tipo?: string
        }
        Relationships: []
      }
      whatsapp_mensajes: {
        Row: {
          contenido: string | null
          created_at: string
          delivery_id: string | null
          direccion: string
          estado: string
          id: string
          telefono: string
          tipo: string
          wa_message_id: string | null
        }
        Insert: {
          contenido?: string | null
          created_at?: string
          delivery_id?: string | null
          direccion: string
          estado?: string
          id?: string
          telefono: string
          tipo?: string
          wa_message_id?: string | null
        }
        Update: {
          contenido?: string | null
          created_at?: string
          delivery_id?: string | null
          direccion?: string
          estado?: string
          id?: string
          telefono?: string
          tipo?: string
          wa_message_id?: string | null
        }
        Relationships: []
      }
      whatsapp_movimientos: {
        Row: {
          accion_id: string
          cantidad_tn: number
          created_at: string
          id: string
          oferta_id: string
          stock_anterior_tn: number
          stock_nuevo_tn: number
        }
        Insert: {
          accion_id: string
          cantidad_tn: number
          created_at?: string
          id?: string
          oferta_id: string
          stock_anterior_tn: number
          stock_nuevo_tn: number
        }
        Update: {
          accion_id?: string
          cantidad_tn?: number
          created_at?: string
          id?: string
          oferta_id?: string
          stock_anterior_tn?: number
          stock_nuevo_tn?: number
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_movimientos_accion_id_fkey"
            columns: ["accion_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_acciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_movimientos_oferta_id_fkey"
            columns: ["oferta_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_ofertas"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_ofertas: {
        Row: {
          accion_id: string | null
          cantidad_tn: number
          codigo: string
          created_at: string
          estado: string
          humedad_pct: number | null
          id: string
          presentacion: string | null
          quebrado_pct: number | null
          telefono: string
          tipo_arroz: string
          variedad: string
        }
        Insert: {
          accion_id?: string | null
          cantidad_tn: number
          codigo: string
          created_at?: string
          estado?: string
          humedad_pct?: number | null
          id?: string
          presentacion?: string | null
          quebrado_pct?: number | null
          telefono: string
          tipo_arroz: string
          variedad: string
        }
        Update: {
          accion_id?: string | null
          cantidad_tn?: number
          codigo?: string
          created_at?: string
          estado?: string
          humedad_pct?: number | null
          id?: string
          presentacion?: string | null
          quebrado_pct?: number | null
          telefono?: string
          tipo_arroz?: string
          variedad?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_ofertas_accion_id_fkey"
            columns: ["accion_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_acciones"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_webhook_events: {
        Row: {
          delivery_id: string
          event: string
          id: string
          payload: Json
          processed_at: string | null
          processing_error: string | null
          received_at: string
        }
        Insert: {
          delivery_id: string
          event: string
          id?: string
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Update: {
          delivery_id?: string
          event?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
