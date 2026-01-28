# Release 03 - Web Rekognition Face Enrollment

## Summary

This release adds Amazon Rekognition face enrollment capabilities to the web admin portal, enabling administrators to enroll employee faces for biometric attendance tracking directly from the dashboard.

## Features

### Face Enrollment

- **Enrollment Dialog**: Modal dialog for enrolling employee faces with two capture methods:
    - **File Upload**: Upload JPEG/PNG images (max 5MB) via file picker with preview
    - **Webcam Capture**: Real-time webcam capture with browser camera API
- **Automatic User Creation**: Automatically creates Rekognition user vectors when enrolling a new employee
- **Re-enrollment Support**: Allows re-enrolling faces for employees who already have face data

### Enrollment Status Indicators

- **Status Badges**: Visual badges in the employees table showing enrollment status:
    - "Enrolled" (green) - Face recognition is configured
    - "Not enrolled" (outline) - Face recognition not yet set up
- **Tooltips**: Hover tooltips explaining the enrollment status

### Employee Actions

- **Enroll Face**: New action to open the face enrollment dialog
- **Re-enroll Face**: Action available for already-enrolled employees
- **Remove Face Enrollment**: Delete Rekognition user data while keeping the employee record
- **Enhanced Delete**: Employee deletion now shows a warning if face data will be removed

## API Endpoints Used

The web admin uses the following existing API endpoints:

| Endpoint                                 | Method | Description                                       |
| ---------------------------------------- | ------ | ------------------------------------------------- |
| `/employees/:id/create-rekognition-user` | POST   | Creates a Rekognition user for the employee       |
| `/employees/:id/enroll-face`             | POST   | Indexes and associates a face image with the user |
| `/employees/:id/rekognition-user`        | DELETE | Removes all Rekognition data for the employee     |

## Technical Implementation

### Server Actions

New server actions in `apps/web/actions/employees-rekognition.ts`:

- `createRekognitionUser(employeeId)` - Creates Rekognition user
- `enrollEmployeeFace(employeeId, imageBase64)` - Enrolls a face image
- `deleteRekognitionUser(employeeId)` - Removes Rekognition data
- `fullEnrollmentFlow(employeeId, imageBase64, hasExisting)` - Combined create + enroll flow

### Components

- `FaceEnrollmentDialog` - Reusable dialog component with upload/webcam tabs

### Mutation Keys

New TanStack Query mutation keys for cache management:

- `employees.createRekognitionUser`
- `employees.enrollFace`
- `employees.deleteRekognitionUser`
- `employees.fullEnrollment`

## Configuration Requirements

### Environment Variables

| Variable                            | Description                | Required  |
| ----------------------------------- | -------------------------- | --------- |
| `AWS_REGION_RKG`                    | AWS region for Rekognition | Yes (API) |
| `AWS_REKOGNITION_COLLECTION_ID_RKG` | Rekognition collection ID  | Yes (API) |
| `AWS_ACCESS_KEY_ID_RKG`             | Rekognition access key     | Yes (API) |
| `AWS_SECRET_ACCESS_KEY_RKG`         | Rekognition secret key     | Yes (API) |
| `NEXT_PUBLIC_API_URL`               | API base URL               | Yes (Web) |

### AWS Permissions

The API service requires the following IAM permissions:

```json
{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Effect": "Allow",
			"Action": [
				"rekognition:CreateUser",
				"rekognition:DeleteUser",
				"rekognition:IndexFaces",
				"rekognition:AssociateFaces",
				"rekognition:DisassociateFaces",
				"rekognition:DeleteFaces",
				"rekognition:ListFaces",
				"rekognition:SearchUsersByImage"
			],
			"Resource": "*"
		}
	]
}
```

## User Guide

### Enrolling an Employee's Face

1. Navigate to the **Employees** page in the dashboard
2. Find the employee in the table
3. Click the **...** (more actions) button
4. Select **Enroll face** (or **Re-enroll face** if already enrolled)
5. Choose your capture method:
    - **Upload**: Click "Select Image" and choose a photo
    - **Webcam**: Click "Start Camera", position the face, and click "Capture Photo"
6. Review the captured image
7. Click **Enroll Face** to complete enrollment

### Best Practices for Face Images

- Ensure good, even lighting on the face
- Face should be clearly visible and centered in the frame
- Avoid hats, sunglasses, or face coverings
- Use a neutral expression
- High resolution images produce better results

### Removing Face Enrollment

1. Navigate to the **Employees** page
2. Click the **...** (more actions) button for the employee
3. Select **Remove face enrollment**
4. Confirm the removal

Note: This only removes the face recognition data; the employee record remains intact.

## Dependencies

No new dependencies were added. The webcam capture uses native browser APIs (`navigator.mediaDevices.getUserMedia`).

## Browser Compatibility

Webcam capture requires:

- Modern browsers with MediaDevices API support
- HTTPS connection (or localhost for development)
- User permission for camera access

## Notes

- Face enrollment is optional; employees can exist without face data
- Deleting an employee automatically removes their Rekognition data
- The enrollment dialog validates image format and size before upload
- Failed enrollments show descriptive error messages from the Rekognition API
