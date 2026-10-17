import { BarChart3, Bot, Database, FileSearch, FileDown, Paintbrush, Wrench, type LucideIcon } from 'lucide-react';

export interface ModuleMeta {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

/** Catalogue des modules connus (cf. StandardModuleKey dans @saas/types). */
export const MODULE_CATALOG: ModuleMeta[] = [
  { key: 'ai_chat', label: 'Assistant IA', description: 'Chat conversationnel avec quotas de tokens et budget par tenant.', icon: Bot },
  { key: 'rag_documents', label: 'Documents & RAG', description: 'Ingestion de documents privés et recherche vectorielle avec citations.', icon: FileSearch },
  { key: 'predictive_analytics', label: 'Analytique prédictive', description: "Prédictions et détection d'anomalies sur vos données métier.", icon: BarChart3 },
  { key: 'agent_tools', label: "Outils d'agents", description: "Actions automatisées par l'IA, avec approbation humaine.", icon: Wrench },
  { key: 'nl_sql', label: 'Langage naturel → SQL', description: 'Interrogez vos données analytiques en langage naturel (lecture seule).', icon: Database },
  { key: 'audit_exports', label: "Exports d'audit", description: "Export du journal d'audit pour vos exigences de conformité.", icon: FileDown },
  { key: 'custom_branding', label: 'Branding personnalisé', description: 'Logo, couleurs et domaine personnalisé pour votre espace.', icon: Paintbrush },
];

export function moduleMeta(key: string): ModuleMeta {
  return (
    MODULE_CATALOG.find((m) => m.key === key) ?? {
      key,
      label: key,
      description: 'Module personnalisé.',
      icon: Wrench,
    }
  );
}
