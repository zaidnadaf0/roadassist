export type RequestStatus =
  | 'requested'
  | 'accepted'
  | 'on-the-way'
  | 'arrived'
  | 'service'
  | 'completed'
  | 'cancelled';

export interface ServiceRequest {
  id: string;
  customerId: string;
  vehicleId: string;
  problemText: string;
  problemCategory?: string;
  status: RequestStatus;
  customerLat: number;
  customerLng: number;
  mechanicId?: string | null;
  mechanicName?: string | null;
  mechanicPhone?: string | null;
  mechanicLat?: number | null;
  mechanicLng?: number | null;
  mechanicLocationUpdatedAt?: number | null;
  etaMin?: number;
  pickedMechanicId?: string;
  offerExpiresAt?: number;
  declinedBy?: string[];
  releaseReason?: string;
  cancellationReason?: string;
  rating?: number;
  comment?: string;
  ratingAggregated?: boolean;
  createdAt: number;
  updatedAt: number;
  cancelledAt?: number;
  cancelledBy?: string;
  ratedAt?: number;
  releasedAt?: number;
}

export type VerificationStatus = 'pending' | 'under_review' | 'approved' | 'suspended' | 'rejected';

export interface MechanicProfile {
  id: string;
  uid?: string;
  name: string;
  approved: boolean;
  verificationStatus?: VerificationStatus;
  specialties: string[];
  vehicleTypes?: string[];
  experienceYears?: number;
  serviceRadiusKm?: number;
  isAvailable: boolean;
  rating?: number;
  /** Exact rating sum maintained with reviewCount for edit-safe aggregation. */
  ratingTotal?: number;
  reviewCount?: number;
  vehicleDescription?: string | null;
  garageName?: string;
  garageAddress?: string;
  currentLat?: number | null;
  currentLng?: number | null;
  locationUpdatedAt?: number | null;
  baseLat?: number | null;
  baseLng?: number | null;
}
